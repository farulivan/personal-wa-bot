# Architecture Guide

A deep dive into how the codebase is structured, how the pieces connect, and how to extend it with new features.

---

## Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [Project Structure](#project-structure)
- [Boot Sequence](#boot-sequence)
- [Message Flow](#message-flow)
- [Module Anatomy](#module-anatomy)
- [Key Patterns](#key-patterns)
- [Adding a New Feature](#adding-a-new-feature)

---

## High-Level Architecture

The codebase follows a **Hexagonal Architecture** (Ports & Adapters) organized as a modular monolith.

```
┌──────────────────────────────────────────────────────────┐
│  Infrastructure Layer                                     │
│  Baileys · PostgreSQL · setInterval · HTTP                │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Application Layer                                  │  │
│  │  index.ts · messageHandler · commandRouter          │  │
│  │  scheduler · authGuard · withErrorBoundary          │  │
│  │                                                     │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Domain Layer                                 │  │  │
│  │  │  parser · service · presenter · streaks       │  │  │
│  │  │  repository interface · Result type           │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**The dependency rule:** inner layers never import from outer layers. A service has zero knowledge that WhatsApp or PostgreSQL exist — it only talks to interfaces.

---

## Project Structure

```
src/
├── index.ts                    # Composition root — wires everything
├── logger.ts                   # Pino logger wrapper
├── processGuards.ts            # Process-level crash guards → clean restart
│
├── config/
│   └── env.ts                  # Centralized env parsing, exports AppConfig
│
├── app/                        # Application layer
│   ├── appContext.ts           # Shared context type (config, gateway, users)
│   ├── messageHandler.ts       # Incoming message → parse → route → reply
│   ├── commandRouter.ts        # Namespace-based command dispatch
│   ├── parseCommand.ts         # Raw text → CommandInvocation
│   ├── authGuard.ts            # WA user ID allowlist check
│   ├── scheduler.ts            # Minute-tick scheduled job runner
│   ├── timeContext.ts          # Offset, now(), and local-day conversion
│   ├── readiness.ts            # Pure ready/not-ready decision for /ready
│   ├── greetingHandler.ts      # Bot mention greeting response
│   └── withErrorBoundary.ts    # Wraps handlers with try/catch
│
├── adapters/
│   └── whatsapp/
│       ├── ports.ts                          # IncomingMessage + the two ports
│       ├── messageGateway.ts                 # Reply/send over MessageSenderPort
│       ├── resolveKnownGroupDbUserIds.ts     # Map WA participants → DB user IDs
│       ├── resolveMentionablePhoneNumbers.ts # Who may be @-mentioned in a group
│       └── baileys/                          # The only Baileys-aware code
│           ├── createBaileysTransport.ts     # Socket, QR, connection lifecycle
│           ├── reconnectPolicy.ts            # Pure reconnect/exit decision table
│           ├── resolveSenderIdentity.ts      # PN vs LID → the id we store
│           ├── baileysIncomingMessage.ts     # WAMessage → IncomingMessage
│           ├── baileysMessageSender.ts       # Sending, incl. per-group mentions
│           ├── baileysGroupMembership.ts     # Implements GroupMembershipPort
│           └── groupMetadata.ts              # Participant shapes + TTL cache
│
├── db/
│   ├── drizzle.ts              # Drizzle connection factory
│   ├── migrate.ts              # Migration runner
│   ├── schema.ts               # Aggregates all module schemas
│   └── migrations/             # SQL migration files
│
├── modules/
│   ├── workouts/               # Workout tracking feature
│   ├── quran/                  # Quran reading tracking feature
│   ├── sholat/                 # Prayer schedule feature
│   ├── remind/                 # Personal reminder feature
│   └── users/                  # User identity and display name management
│
├── shared/
│   ├── result.ts               # Result<T, E> type + ok/err constructors
│   ├── identity.ts             # WaUserId / PhoneNumber — distinct on purpose
│   ├── streaks.ts              # Consecutive-day calculation
│   ├── dateRange.ts            # Local-day range helpers
│   ├── mentions.ts             # @-mention text building
│   └── parsing.ts              # Tokenizer shared by the parsers
│
└── types/                      # Global type declarations
```

---

## Boot Sequence

`src/index.ts` is the **composition root** — the single place that knows about all concrete implementations. Nothing constructs itself; everything is wired here.

```
main()
 │
 ├── 1. installProcessGuards()             — unhandled throws become clean exits
 ├── 2. runMigrations(databaseUrl)         — apply schema before anything else
 ├── 3. createDrizzleDb(databaseUrl)       — raw DB connection
 ├── 4. createBaileysTransport()           — socket, ports, reconnect ladder
 │      onMessage / onReady are passed in here but assigned in step 9,
 │      because the router they need doesn't exist yet
 │
 ├── 5. Construct repositories             — concrete Drizzle implementations
 │      DrizzleWorkoutRepository(db)
 │      DrizzleQuranRepository(db)
 │      DrizzleRemindRepository(db)
 │      DrizzleSholatRepository(db)
 │      DrizzleUserRepository(db)
 │
 ├── 6. Construct adapters
 │      transport.senderPort               — MessageSenderPort
 │      transport.membershipPort           — GroupMembershipPort
 │      createMessageGateway(senderPort)   — reply/send wrapper
 │
 ├── 7. Register modules                   — each returns { controller, jobs }
 │      registerWorkoutModule({ workoutRepository, ... })
 │      registerQuranModule({ quranRepository, ... })
 │      registerSholatModule({ ... })
 │      registerRemindModule({ ... })
 │
 ├── 8. Wire command router
 │      router.registerNamespace('workout', workout.controller)
 │      router.registerNamespace('quran', quran.controller)
 │      ...
 │
 ├── 9. Fill in the transport hooks
 │      handleMessage = createMessageHandler(router, appContext)
 │      onSocketReady = start the reminder, sholat and digest schedulers
 │
 ├── 10. Serve /ready                      — evaluateReadiness(transport.isConnected())
 ├── 11. Register SIGTERM / SIGINT         — stop schedulers, close server + DB
 ├── 12. await transport.start()           — connect, or print the QR
 └── 13. Schedule the nightly restart      — outside the ready hook, so a bot
                                             stuck at the QR screen still recycles
```

**Why this matters:** swapping PostgreSQL for another database means changing only this file and the `infra/` implementations. The domain and application layers are untouched.

**Why `/ready` asks the transport every time** rather than latching a boolean at startup: a socket that drops or wedges after boot has to be visible to the monitor. `hasStarted` only records that we got there once; `transport.isConnected()` is the live answer. Any other path returns a flat `200 OK`, which says nothing more than "the process is running" — which is exactly what was true throughout the [2026-07-25 outage](incidents/2026-07-25-whatsapp-logout-inject-crash.md).

---

## Message Flow

What happens when a user sends `#workout lift push up 20reps 4sets`:

```
WhatsApp message event
        │
        ▼
┌─ messageHandler.ts ──────────────────────────────┐
│  1. Read senderId — already resolved by the       │
│     transport to the form WhatsApp addressed      │
│  2. Auth check: any of msg.senderCandidates       │
│  3. Group check: require bot mention OR # prefix  │
│  4. Capture user contact info (if new)            │
│  5. parseCommand(text) → CommandInvocation         │
│  6. Build CommandContext { sender, replyChatId,    │
│     isGroupChat, timezoneOffsetMinutes, now() }   │
│  7. router.route(ctx, invocation)                 │
└──────────────────────────┬───────────────────────┘
                           │
                           ▼
┌─ commandRouter.ts ───────────────────────────────┐
│  Lookup handler by invocation.namespace            │
│  → calls workout.controller(ctx, invocation)       │
└──────────────────────────┬───────────────────────┘
                           │
                           ▼
┌─ workoutController.ts ───────────────────────────┐
│  1. Detect subcommand: help? list? log?           │
│  2. parseWorkoutPayload(invocation) → Result<T>   │
│  3. workoutService.logLift(sender, payload, now)  │
│  4. workoutService.getStreakAfterLog(...)          │
│  5. formatLiftLogResponse(...) + formatStreakNote  │
│  6. Return response string                        │
└──────────────────────────┬───────────────────────┘
                           │
                           ▼
┌─ messageHandler.ts ──────────────────────────────┐
│  messageGateway.reply(msg, responseText)           │
└──────────────────────────────────────────────────┘
        │
        ▼
  User receives reply
```

The key type that bridges the app layer and modules:

```typescript
type CommandInvocation = {
  namespace: string;     // "workout"
  subcommand: string;    // "list" (from --list) or "log" (default)
  firstLine: string;     // "#workout lift push up 20reps 4sets"
  payloadText: string;   // multiline text after first line
  rawText: string;       // original full text
};
```

---

## Module Anatomy

Every feature module follows the **exact same internal structure**. This consistency is the architecture's most important property.

```
modules/<name>/
├── index.ts               # Registration factory — the module's only public API
├── <name>Parser.ts        # Pure input parsing → Result<T>
├── <name>Service.ts       # Business logic, depends on repository interface
├── <name>Controller.ts    # Thin bridge: invocation → service → presenter → string
├── <name>Presenter.ts     # Pure string formatting, all user-facing text lives here
├── <name>Streaks.ts       # (Optional) Domain calculation logic
├── <name>Digest.ts        # (Optional) Scheduled job logic
└── infra/
    ├── <name>Repository.ts         # Interface — the contract
    ├── drizzle<Name>Repository.ts  # Implementation — Drizzle queries
    └── schema.ts                   # Drizzle table definition
```

### What each file does

| File | Pure? | Responsibility |
|---|---|---|
| `index.ts` | No | Factory that wires parser + service + controller. Exports `{ controller, jobs }`. |
| `parser.ts` | **Yes** | Takes raw text, returns `Result<ParsedPayload>`. No async, no I/O. |
| `service.ts` | No | Business logic: validation, persistence via repository interface, domain rules. |
| `controller.ts` | No | Thin adapter: reads invocation → calls service → calls presenter → returns string. |
| `presenter.ts` | **Yes** | Formats data into user-facing text. No I/O, no business logic. |
| `infra/repository.ts` | — | TypeScript interface defining the data access contract. |
| `infra/drizzle*.ts` | No | Implements the repository interface with Drizzle ORM queries. |
| `infra/schema.ts` | — | Drizzle table definition. Exported via `src/db/schema.ts` for migrations. |

### Data flow through a module

```
User text
  → Parser (pure: text → Result<Payload>)
    → Service (async: payload → business logic → repository calls)
      → Presenter (pure: data → formatted string)
        → Response back to user
```

---

## Key Patterns

### 1. Result Type

```typescript
type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };
```

Used for all expected failures (bad input, business rule violations). The caller **must** check `result.ok` before accessing `result.value`. Exceptions are reserved for unexpected errors only.

```typescript
// Parser returns Result
const parsed = parseWorkoutPayload(invocation);
if (!parsed.ok) return parsed.error;  // send error message to user

// Service returns Result with typed error
const result = await remindService.createReminder(...);
if (!result.ok) {
  if (result.error.reason === 'active_limit') return formatActiveLimitMessage(...);
  return formatPastTimeMessage();
}
```

### 2. Ports & Adapters

When a module needs infrastructure (WhatsApp, external APIs), it depends on an **interface** (port), never a concrete implementation:

```typescript
// Port — defined in adapters/whatsapp/ports.ts
interface GroupMembershipPort {
  listMemberIdentities(groupId: string): Promise<GroupMemberIdentity[]>;
  resolveBotUserId(): Promise<string | null>;
}

interface MessageSenderPort {
  sendMessage(chatId: string, text: string): Promise<unknown>;
}
```

The adapter (`WhatsAppGroupMembershipAdapter`) implements the port. The composition root wires them together. Modules never import concrete adapters.

### 3. Composition Root

`src/index.ts` is the **only file** that knows about all concrete types. This is where dependency injection happens — not through a DI container, but through explicit constructor arguments.

```typescript
// index.ts — explicit wiring
const workoutRepository = new DrizzleWorkoutRepository(drizzleDb, appConfig.minWorkoutsForStreak);
const workoutService = new WorkoutService(workoutRepository, ...);
```

### 4. Error Boundary Wrapper

Every module controller is wrapped with `withErrorBoundary` before being registered:

```typescript
const controller = withErrorBoundary('workout', createWorkoutController(workoutService));
```

If an unhandled exception escapes a module, the wrapper catches it, logs it, and sends a graceful message to the user. The bot never crashes from a module error.

### 5. CommandContext Injection

Handlers receive a `CommandContext` with everything they need — no global state:

```typescript
type CommandContext = {
  sender: string;
  replyChatId: string;
  isGroupChat: boolean;
  timezoneOffsetMinutes: number;
  now: () => Date;              // function, not value — testable
};
```

`now` is a function so tests can freeze time: `now: () => new Date('2026-01-01T00:00:00Z')`.

### 6. Module Registration

Each module exposes a single factory function that receives all dependencies and returns a uniform shape:

```typescript
function registerWorkoutModule(deps: WorkoutModuleDeps): WorkoutModuleRegistration {
  // internal wiring: service, controller
  return { controller, jobs };
}
```

The composition root doesn't know or care about a module's internals. It only calls the factory and uses the returned `controller` and `jobs`.

### 7. Branded Identifiers

Read this before touching anything that handles a user.

WhatsApp addresses a person either by phone number or by **LID** — a long number with no relationship to their phone number — and which one you get depends on the chat. Rows are keyed on whichever form WhatsApp handed us, and in these chats that is the LID. `users.phone_number` is separate metadata that does **not** match `users.id`, and `ALLOWED_WA_IDS` holds IDs, not phone numbers.

Deriving a user ID from a phone number therefore orphans every existing row and makes the allowlist reject people it used to admit — silently, because nothing throws. That has shipped twice. So the two are separate types with no implicit conversion:

```typescript
declare const WA_USER_ID: unique symbol;
export type WaUserId = string & { readonly [WA_USER_ID]: true };

export function toWaUserId(addressedJid: string): WaUserId;  // the addressed form
export function toPhoneNumber(phoneJid: string): PhoneNumber; // separate metadata
```

Construct them through those functions; never cast a bare string. **If a type error says a `PhoneNumber` is not a `WaUserId`, that is the guard doing its job — fix the call rather than casting past it.** Background: [ADR 0005](adr/0005-whatsapp-transport.md).

`resolveSenderIdentity.ts` is the one place that decides which form was used, and everything downstream receives the answer rather than re-deriving it.

---

## Adding a New Feature

Follow this recipe to add a new module that is architecturally consistent with the rest of the codebase.

### Example: Adding a `#mood` command

**1. Create the module folder**

```
src/modules/mood/
├── index.ts
├── moodParser.ts
├── moodService.ts
├── moodController.ts
├── moodPresenter.ts
└── infra/
    ├── moodRepository.ts
    ├── drizzleMoodRepository.ts
    └── schema.ts
```

**2. Define the schema** (`infra/schema.ts`)

```typescript
import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core';

export const moods = pgTable('moods', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  score: integer('score').notNull(),
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
});
```

**3. Define the repository interface** (`infra/moodRepository.ts`)

```typescript
export type MoodEntry = { createdAt: string; score: number; note: string };
export type NewMoodEntry = { userId: string; score: number; note: string; createdAt: string };

export interface MoodRepository {
  insert(entry: NewMoodEntry): Promise<void>;
  listByUser(userId: string, limit: number, offset: number): Promise<MoodEntry[]>;
  countByUser(userId: string): Promise<number>;
}
```

**4. Implement the repository** (`infra/drizzleMoodRepository.ts`)

```typescript
import type { DrizzleDb } from '../../../db/drizzle.js';
import type { MoodRepository, MoodEntry, NewMoodEntry } from './moodRepository.js';
import { moods } from './schema.js';

export class DrizzleMoodRepository implements MoodRepository {
  constructor(private readonly db: DrizzleDb) {}
  // ... implement interface methods with Drizzle queries
}
```

**5. Write the parser** (`moodParser.ts`) — pure, no I/O

```typescript
import { ok, err } from '../../shared/result.js';
import type { Result } from '../../shared/result.js';

export type MoodPayload = { score: number; note: string };

export function parseMoodPayload(firstLine: string): Result<MoodPayload> {
  // tokenize, validate score 1-10, extract note
}
```

**6. Write the service** (`moodService.ts`) — depends on interface only

```typescript
import type { MoodRepository } from './infra/moodRepository.js';

export class MoodService {
  constructor(private readonly moodRepository: MoodRepository) {}

  async logMood(userId: string, score: number, note: string, now: Date): Promise<void> {
    await this.moodRepository.insert({ userId, score, note, createdAt: now.toISOString() });
  }
}
```

**7. Write the presenter** (`moodPresenter.ts`) — pure string formatting

```typescript
export function formatMoodLogged(score: number): string {
  return `Mood logged: ${score}/10`;
}
```

**8. Write the controller** (`moodController.ts`) — thin bridge

```typescript
import type { NamespaceHandler } from '../../app/commandRouter.js';
import { parseMoodPayload } from './moodParser.js';
import { formatMoodLogged } from './moodPresenter.js';
import type { MoodService } from './moodService.js';

export function createMoodController(moodService: MoodService): NamespaceHandler {
  return async (ctx, invocation) => {
    if (invocation.namespace !== 'mood') return null;
    const parsed = parseMoodPayload(invocation.firstLine);
    if (!parsed.ok) return parsed.error;
    await moodService.logMood(ctx.sender, parsed.value.score, parsed.value.note, ctx.now());
    return formatMoodLogged(parsed.value.score);
  };
}
```

**9. Write the registration factory** (`index.ts`)

```typescript
import { withErrorBoundary } from '../../app/withErrorBoundary.js';
import { createMoodController } from './moodController.js';
import { MoodService } from './moodService.js';
import type { MoodRepository } from './infra/moodRepository.js';

export type MoodModuleDeps = { moodRepository: MoodRepository };

export function registerMoodModule(deps: MoodModuleDeps) {
  const moodService = new MoodService(deps.moodRepository);
  const controller = withErrorBoundary('mood', createMoodController(moodService));
  return { controller, jobs: [] };
}
```

**10. Wire into the composition root** (`src/index.ts`)

```typescript
import { DrizzleMoodRepository } from './modules/mood/infra/drizzleMoodRepository.js';
import { registerMoodModule } from './modules/mood/index.js';

const moodRepository = new DrizzleMoodRepository(drizzleDb);
const mood = registerMoodModule({ moodRepository });
router.registerNamespace('mood', mood.controller);
```

**11. Export schema** in `src/db/schema.ts`

```typescript
export { moods } from '../modules/mood/infra/schema.js';
```

**12. Generate migration and test**

```bash
pnpm db:generate
pnpm verify
pnpm test
```

### Checklist for any new module

- [ ] `infra/schema.ts` — table definition
- [ ] `infra/<name>Repository.ts` — interface
- [ ] `infra/drizzle<Name>Repository.ts` — implementation
- [ ] `<name>Parser.ts` — pure parsing with `Result<T>`
- [ ] `<name>Service.ts` — business logic, receives interface
- [ ] `<name>Presenter.ts` — pure string formatting
- [ ] `<name>Controller.ts` — thin bridge wired with `withErrorBoundary`
- [ ] `index.ts` — registration factory returning `{ controller, jobs }`
- [ ] Schema exported in `src/db/schema.ts`
- [ ] Wired in `src/index.ts` (repository + register + router)
- [ ] Migration generated (`pnpm db:generate`)
- [ ] Parser unit tests
- [ ] `pnpm verify` passes

# Architecture Improvement Plan

Identified from architecture review. Eight concrete weaknesses, each with root cause, impact, and a step-by-step fix plan.

---

## Table of Contents

1. [Scheduler Memory Leak](#1-scheduler-memory-leak)
2. [Wide-Table Schema Anti-Pattern](#2-wide-table-schema-anti-pattern)
3. [Infrastructure Concern in Domain Service](#3-infrastructure-concern-in-domain-service)
4. [Hardcoded Business Rule Constant](#4-hardcoded-business-rule-constant)
5. [timezoneOffsetMinutes Propagation Smell](#5-timezoneoffsetminutes-propagation-smell)
6. [No Integration / DB-Level Tests](#6-no-integration--db-level-tests)
7. [SQL Reserved Word as Column Name](#7-sql-reserved-word-as-column-name)
8. [No Observability Layer](#8-no-observability-layer)

---

## 1. Scheduler Memory Leak

**File:** `src/app/scheduler.ts`

### Root Cause

The `fired` Set accumulates a new string key every minute the scheduler runs. Each key looks like `"Daily Streak Standings:2026-04-12T08:00"`. Over months of 24/7 uptime, this Set grows without any eviction mechanism.

```ts
// Current — grows forever
const fired = new Set<string>();
// key format: "jobName:2026-04-12T08:00"
```

### Impact

- Memory grows indefinitely on long-running deployments (Railway, Docker).
- No job ever fires twice in the same minute, which is correct, but the deduplication window is unlimited instead of just "within the same minute."

### Fix Plan

**Option A (Minimal — recommended):** Replace the unbounded `Set` with a single `lastFiredMinute` string per job. A job fires if the current minute string doesn't match the last fired key.

```ts
// Replace fired Set with a Map<jobName, lastFiredKey>
const lastFired = new Map<string, string>();

const tick = () => {
  for (const job of jobs) {
    const { hour, minute } = getUserHourMinute(job.timezoneOffsetMinutes);
    if (hour === job.hour && minute === job.minute) {
      const key = `${job.name}:${new Date().toISOString().slice(0, 16)}`;
      if (lastFired.get(job.name) !== key) {
        lastFired.set(job.name, key);
        job.run().catch(...);
      }
    }
  }
};
```

**Option B (Better long-term):** Replace the hand-rolled scheduler with `node-cron`, which handles cron expressions, timezone-aware scheduling, and deduplication natively.

```ts
import cron from 'node-cron';
// "0 8 * * *" = every day at 08:00
cron.schedule('0 8 * * *', () => sendDigest(), { timezone: 'Asia/Jakarta' });
```

### Steps

- [ ] Replace `fired: Set<string>` with `lastFired: Map<string, string>` in `scheduler.ts`
- [ ] Update `tick()` logic to compare per-job last-fired key
- [ ] Write a unit test asserting the same job does not fire twice in one minute
- [ ] (Future) Evaluate migrating to `node-cron` when adding more complex schedules

---

## 2. Wide-Table Schema Anti-Pattern

**File:** `src/modules/workouts/infra/schema.ts`

### Root Cause

`lift` and `cardio` workouts share one flat table. Lift-specific columns (`reps`, `sets`, `weight`) are `notNull` for cardio rows and vice versa, so they default to `0` as a sentinel value. This is semantically incorrect — a cardio row having `reps = 0` is meaningless noise, not a valid state.

```ts
// Current — lift and cardio mixed, semantically wrong defaults
reps: integer('reps').notNull(),          // meaningless for cardio
durationMinutes: real('duration_minutes').notNull().default(0), // meaningless for lift
```

### Impact

- Future queries that filter or aggregate by mode become error-prone.
- Adding new workout modes (e.g., stretch, swimming) requires adding more nullable columns.
- The repository already has to manually handle this (inserting `reps: 0` for cardio rows).

### Fix Plan

**Option A — Separate tables (clean, recommended):**

```ts
// workout_lifts table
export const workoutLifts = pgTable('workout_lifts', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  activity: text('activity').notNull(),
  reps: integer('reps').notNull(),
  sets: integer('sets').notNull(),
  weightKg: real('weight_kg').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

// workout_cardios table
export const workoutCardios = pgTable('workout_cardios', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  activity: text('activity').notNull(),
  durationMinutes: real('duration_minutes').notNull(),
  distanceKm: real('distance_km').notNull().default(0),
  createdAt: text('created_at').notNull(),
});
```

**Option B — JSONB payload column (flexible for future modes):**

```ts
export const workouts = pgTable('workouts', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  mode: text('mode').notNull(),   // 'lift' | 'cardio'
  payload: jsonb('payload').notNull(),
  createdAt: text('created_at').notNull(),
});
```

### Steps

- [ ] Decide on Option A vs B (A is recommended for type safety)
- [ ] Write a new Drizzle migration splitting the table
- [ ] Update `DrizzleWorkoutRepository` to read/write the new schema
- [ ] Update `WorkoutRepository` interface if method signatures change
- [ ] Backfill existing data via migration script
- [ ] Run full test suite after migration

---

## 3. Infrastructure Concern in Domain Service

**File:** `src/modules/workouts/workoutService.ts`

### Root Cause

`WorkoutService.getDigestStandings()` accepts a `GroupMembershipPort` parameter directly. The domain service is calling into infrastructure (WhatsApp group membership) — the inner ring reaching into the outer ring.

```ts
// Current — service receives infra port directly
async getDigestStandings(
  port: GroupMembershipPort,   // ← infrastructure leaking into domain
  groupChatId: string,
  ...
```

### Impact

- `WorkoutService` cannot be tested without mocking a WA adapter.
- The method's responsibility is unclear — is it a domain method or an application-level use case?
- Violates the dependency rule of hexagonal architecture.

### Fix Plan

Move the resolution logic out of the service and into `workoutDigest.ts` (the application layer). The service only answers domain questions; the digest orchestrator handles identity resolution.

```ts
// workoutDigest.ts — application layer, allowed to use ports
const targetUserIds = await resolveGroupDbUserIds(membershipPort, groupChatId, dbUsers);
const standings = await Promise.all(
  targetUserIds.map(async (userId) => {
    const streaks = await workoutService.getStreaksByUser(userId, tz, now);
    const name = await userRepository.getDisplayName(userId);
    return { name, ...streaks };
  })
);

// workoutService.ts — clean domain method, no port
async getStreaksByUser(userId: string, timezoneOffsetMinutes: number, now: Date): Promise<StreakInfo> {
  const days = await this.workoutRepository.getQualifyingStreakDays(userId, timezoneOffsetMinutes);
  return computeStreaks(days, timezoneOffsetMinutes, now);
}
```

### Steps

- [ ] Add `getStreaksByUser(userId, tz, now)` method to `WorkoutService`
- [ ] Move digest resolution logic (resolve group members → loop → fetch streaks) into `workoutDigest.ts`
- [ ] Remove `getDigestStandings` from `WorkoutService`
- [ ] Remove `GroupMembershipPort` import from `workoutService.ts`
- [ ] Update tests if `getDigestStandings` is currently tested

---

## 4. Hardcoded Business Rule Constant

**File:** `src/modules/remind/remindService.ts`

### Root Cause

`REMINDER_ACTIVE_LIMIT = 50` is a magic constant hardcoded inside the service, invisible to configuration. Every other per-user limit (`workoutListLimit`, `quranListLimit`, `remindListLimit`) is configurable via env var and `appConfig`.

```ts
// Current
const REMINDER_ACTIVE_LIMIT = 50;
```

### Impact

- Requires a code change and redeploy to adjust the limit.
- Inconsistent with how every other limit in the codebase is handled.

### Fix Plan

```ts
// src/config/env.ts — add
remindActiveLimit: parseIntegerEnv('REMIND_ACTIVE_LIMIT', 50),

// src/modules/remind/remindService.ts — receive via constructor
export class RemindService {
  constructor(
    private readonly remindRepository: RemindRepository,
    private readonly remindListLimit: number = 10,
    private readonly remindActiveLimit: number = 50,   // ← injected
  ) {}
}

// src/modules/remind/index.ts — pass from deps
const remindService = new RemindService(
  deps.remindRepository,
  deps.remindListLimit,
  deps.remindActiveLimit,
);

// src/index.ts — wire from config
const remind = registerRemindModule({
  ...
  remindActiveLimit: appConfig.remindActiveLimit,
});
```

### Steps

- [ ] Add `REMIND_ACTIVE_LIMIT` to `src/config/env.ts`
- [ ] Add `remindActiveLimit` to `RemindModuleDeps` in `src/modules/remind/index.ts`
- [ ] Pass `remindActiveLimit` as constructor arg to `RemindService`
- [ ] Remove the hardcoded `REMINDER_ACTIVE_LIMIT` constant from `remindService.ts`
- [ ] Add `REMIND_ACTIVE_LIMIT=50` with comment to `.env.example`
- [ ] Update `README.md` env table

---

## 5. `timezoneOffsetMinutes` Propagation Smell

**File:** Throughout — `index.ts` → module → service → repository → SQL query

### Root Cause

`timezoneOffsetMinutes` is a single integer that tunnels through every layer of the stack as a raw number. It appears in controller method signatures, service method signatures, repository method signatures, and raw SQL expressions. Adding a second timezone or changing the representation would require touching many files.

### Impact

- Refactoring timezone handling requires touching every layer.
- Method signatures have noisy extra parameters everywhere.
- Mixing timezone math (offset arithmetic) with business logic reduces readability.

### Fix Plan

**Option A (Minimal — low risk):** Create a `TimeContext` value object passed through `CommandContext`, avoiding raw integer threading.

```ts
// src/app/timeContext.ts
export type TimeContext = {
  now: () => Date;
  timezoneOffsetMinutes: number;
  toUserDate: (utcDate: Date) => Date;
  todayUserDateStr: () => string;  // 'YYYY-MM-DD' in user timezone
};

export function createTimeContext(offsetMinutes: number): TimeContext {
  return {
    now: () => new Date(),
    timezoneOffsetMinutes: offsetMinutes,
    toUserDate: (utcDate) => new Date(utcDate.getTime() + offsetMinutes * 60000),
    todayUserDateStr: () => {
      const d = new Date(Date.now() + offsetMinutes * 60000);
      return d.toISOString().slice(0, 10);
    },
  };
}
```

**Option B (Larger refactor):** Use `luxon` or `dayjs` with timezone plugin, replacing all manual offset math with named timezones.

### Steps

- [ ] Decide on Option A (quick win) vs Option B (better long-term)
- [ ] For Option A: create `src/app/timeContext.ts` with `TimeContext` type
- [ ] Extend `CommandContext` with `timeContext: TimeContext` instead of raw `timezoneOffsetMinutes`
- [ ] Update `messageHandler.ts` to build `TimeContext` from config
- [ ] Gradually migrate service/presenter calls to use `TimeContext` helpers

---

## 6. No Integration / DB-Level Tests

**Files:** All `infra/drizzle*.ts` files, `src/db/`

### Root Cause

The test suite covers only pure functions (parsers, streak calculators, service business logic with mocked repositories). There are zero tests that exercise the real Drizzle query logic against a real database. A broken SQL query (wrong column name, wrong aggregation) would only surface at runtime.

### Impact

- Broken DB queries are caught only in production.
- Schema migrations cannot be automatically verified.
- Refactoring repository implementations has no safety net.

### Fix Plan

Use `vitest` with a real PostgreSQL test database (can be a local Docker instance or a `postgres` test container via `testcontainers`).

**Structure:**
```
src/modules/workouts/infra/
└── drizzleWorkoutRepository.test.ts   ← integration test
```

**Pattern:**
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDrizzleDb } from '../../../db/drizzle.js';
import { DrizzleWorkoutRepository } from './drizzleWorkoutRepository.js';
import { runMigrations } from '../../../db/migrate.js';

const TEST_DB_URL = process.env.TEST_DATABASE_URL!;

describe('DrizzleWorkoutRepository', () => {
  let db: DrizzleDb;
  let repo: DrizzleWorkoutRepository;

  beforeAll(async () => {
    await runMigrations(TEST_DB_URL);
    ({ db } = createDrizzleDb(TEST_DB_URL));
    repo = new DrizzleWorkoutRepository(db, 3);
  });

  beforeEach(async () => {
    await db.delete(workouts);  // clean slate per test
  });

  it('counts workouts by user', async () => {
    await repo.insertWorkoutLog({ user: 'abc', workoutMode: 'lift', ... });
    expect(await repo.countByUser('abc')).toBe(1);
  });
});
```

### Steps

- [ ] Add `TEST_DATABASE_URL` to `.env.example`
- [ ] Add `vitest.integration.config.ts` with separate config for integration tests
- [ ] Add `"test:integration"` script to `package.json`
- [ ] Write integration tests for `DrizzleWorkoutRepository`
- [ ] Write integration tests for `DrizzleRemindRepository`
- [ ] Write integration tests for `DrizzleQuranRepository`
- [ ] Add integration test run to CI (`.github/workflows/`)

---

## 7. SQL Reserved Word as Column Name

**File:** `src/modules/workouts/infra/schema.ts`

### Root Cause

The column `user` is an SQL reserved word in PostgreSQL. Drizzle ORM quotes it automatically, so it works — but it's fragile and confusing. Raw SQL queries, logs, and migrations all show `"user"` with quotes, which is non-obvious.

```ts
// Current
user: text('user').notNull(),
```

### Impact

- Risk of breakage if Drizzle's quoting behavior changes or raw SQL is used.
- Misleading when reading query logs — `WHERE "user" = $1` looks wrong.
- Inconsistent with `userId` used in other modules (`reminders.userId`, `users.id`).

### Fix Plan

Rename the column to `user_id` in the schema and provide a migration:

```ts
// New schema
export const workouts = pgTable('workouts', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),   // ← renamed
  ...
});
```

```sql
-- Migration
ALTER TABLE workouts RENAME COLUMN "user" TO user_id;
```

### Steps

- [ ] Add a new Drizzle migration renaming the column (`drizzle-kit generate`)
- [ ] Update `schema.ts` — `user` → `userId: text('user_id')`
- [ ] Update all references in `DrizzleWorkoutRepository` (`workouts.user` → `workouts.userId`)
- [ ] Update `WorkoutRepository` interface types if `user` field name is exposed
- [ ] Test that existing data is preserved after migration

---

## 8. No Observability Layer

**File:** `src/logger.ts` and throughout all modules

### Root Cause

The logger wraps `pino` but exposes only `log`, `debug`, `error` functions. Log calls have no structured fields — they're plain strings. There's no request ID, no module name, no user ID embedded in log records. Correlating a sequence of events for a single user command is impossible from logs alone.

```ts
// Current — unstructured, no correlation
debug(`📨 from=${msg.from}, rawSender=${rawSender}, sender=${sender}`);
error('❌ Error handling message:', err);
```

### Impact

- Cannot filter logs by user, module, or command in production.
- Debugging a specific user's issue requires reading all logs chronologically.
- No visibility into command latency or scheduler timing.

### Fix Plan

**Phase 1 (Quick win):** Add a `requestId` (short UUID) per incoming message and pass it through log calls as a structured field using `pino`'s child logger.

```ts
// src/logger.ts — add child logger factory
import pino from 'pino';
export const rootLogger = pino({ level: ... });

export function createRequestLogger(requestId: string, sender: string) {
  return rootLogger.child({ requestId, sender });
}
```

```ts
// src/app/messageHandler.ts — create per-message logger
const requestId = crypto.randomUUID().slice(0, 8);
const reqLog = createRequestLogger(requestId, sender);
reqLog.debug({ from: msg.from }, 'message received');
```

**Phase 2 (Structured module logging):** Each module receives a logger child from its `index.ts` factory, scoped with `{ module: 'workout' }`.

**Phase 3 (Metrics):** Add command latency tracking — record `Date.now()` before and after `router.route()`, emit as a structured log field. Enables future integration with log-based metrics (e.g., Datadog, Grafana Loki).

### Steps

- [ ] Add `createRequestLogger(requestId, sender)` to `src/logger.ts`
- [ ] Generate `requestId` in `messageHandler.ts` per incoming message
- [ ] Thread `reqLog` through `router.route()` call (may require extending `CommandContext`)
- [ ] Replace free-form `debug(string)` calls inside handlers with structured `log.debug({ field }, msg)` pattern
- [ ] Add `{ module: 'moduleName' }` as child logger context in each module's `index.ts`
- [ ] Add command start/end timing log in `messageHandler.ts`

---

## Priority Order

| # | Improvement | Effort | Risk | Priority |
|---|---|---|---|---|
| 4 | Hardcoded active limit | XS | None | **Do first** |
| 7 | Column rename `user` → `user_id` | S | Low (migration) | **Do first** |
| 1 | Scheduler memory leak fix | S | None | **Do first** |
| 3 | Remove port from service | M | Low | **Do next** |
| 6 | Integration tests | M | None | **Do next** |
| 8 | Observability (Phase 1 only) | M | None | **Do next** |
| 5 | TimeContext refactor | L | Medium | **Plan later** |
| 2 | Schema split (wide table) | L | High (migration + backfill) | **Plan later** |

---

## How to Use This Document

1. Pick one item from the top of the priority list.
2. Follow its **Steps** checklist — check off each box as you complete it.
3. Open a focused branch per improvement (e.g., `fix/scheduler-memory-leak`).
4. Write or update tests as part of the same branch — do not defer tests.
5. Mark steps done in this file after merging.

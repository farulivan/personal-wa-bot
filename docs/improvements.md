# Architecture Improvement Plan

Seven improvements to push the architecture from solid to excellent.

---

## Table of Contents

- [1. Quran Schema `user` → `user_id` Column Rename](#1-quran-schema-user--user_id-column-rename)
- [2. Integration Tests for Quran and Sholat Repositories](#2-integration-tests-for-quran-and-sholat-repositories)
- [3. WhatsApp Reconnection with Exponential Backoff](#3-whatsapp-reconnection-with-exponential-backoff)
- [4. Remove Deprecated Fields from CommandContext](#4-remove-deprecated-fields-from-commandcontext)
- [5. Structured Module-Level Logging](#5-structured-module-level-logging)
- [6. Drop `workouts_deprecated` Table](#6-drop-workouts_deprecated-table)
- [7. CI Integration Test Pipeline](#7-ci-integration-test-pipeline)
- [Priority Order](#priority-order)
- [How to Use This Document](#how-to-use-this-document)

---

### 1. Quran Schema `user` → `user_id` Column Rename

**Files:** `src/modules/quran/infra/schema.ts`, `src/modules/quran/infra/drizzleQuranRepository.ts`, `src/modules/quran/infra/quranRepository.ts`, `src/modules/quran/quranService.ts`

#### Root Cause

Same issue fixed for workouts in Phase 1 — `user` is a SQL reserved word. The Quran module still uses `user: text('user')` in both `quranDailyReads` and `quranMarks` tables. `quranMarks.user` is also the PRIMARY KEY, so the rename requires an index rebuild.

```ts
// Current — SQL reserved word
export const quranDailyReads = pgTable('quran_daily_reads', {
  user: text('user').notNull(),   // ← reserved word
  ...
});
export const quranMarks = pgTable('quran_marks', {
  user: text('user').primaryKey(), // ← reserved word + PK
  ...
});
```

#### Impact

- Fragile if raw SQL is used without quoting.
- Inconsistent with workout tables which already use `user_id`.
- Misleading in query logs: `WHERE "user" = $1`.

#### Fix Plan

```sql
-- Migration
ALTER TABLE "quran_daily_reads" RENAME COLUMN "user" TO "user_id";
ALTER TABLE "quran_marks" RENAME COLUMN "user" TO "user_id";
```

```ts
// Updated schema
userId: text('user_id').notNull(),    // quranDailyReads
userId: text('user_id').primaryKey(), // quranMarks
```

#### Steps

- [ ] Write SQL migration renaming `user` → `user_id` on both Quran tables
- [ ] Update `src/modules/quran/infra/schema.ts` — `user` → `userId: text('user_id')`
- [ ] Update index definition to use `table.userId`
- [ ] Update `drizzleQuranRepository.ts` — all `quranDailyReads.user` / `quranMarks.user` references
- [ ] Update `quranRepository.ts` types — `NewQuranReadLog.user`, `QuranDailyReadRow.user`, `QuranMarkRow.user`
- [ ] Update `quranService.ts` — all call sites passing `.user`
- [ ] Run type check and tests

---

### 2. Integration Tests for Quran and Sholat Repositories

**Files:** `src/modules/quran/infra/drizzleQuranRepository.ts`, `src/modules/sholat/infra/drizzleSholatRepository.ts`

#### Root Cause

Workout and Remind repos have integration tests; Quran and Sholat don't. `DrizzleQuranRepository` has complex timezone-aware date queries (streak calculation, daily read upsert) that need DB-level verification. `DrizzleSholatRepository` has cache lookup logic with foreign key constraints.

#### Impact

- Broken timezone queries in Quran only surface at runtime.
- Sholat cache logic is untested against real FK constraints.
- Incomplete coverage creates false confidence.

#### Fix Plan

Use existing `testHelper.ts` infrastructure (`setupTestDb`, `cleanAllTables`).

**Quran test cases:**
- Insert daily read, verify count and upsert behavior (same day update vs new day insert)
- Streak calculation across multiple days with timezone offset
- Mark set/get round-trip
- Distinct users listing

**Sholat test cases:**
- Location insert and lookup
- Cache set and get by location + date
- Foreign key constraint between cache and locations

#### Steps

- [ ] Write `drizzleQuranRepository.integration.test.ts` covering daily reads, streaks, marks
- [ ] Write `drizzleSholatRepository.integration.test.ts` covering locations, cache, FK constraints
- [ ] Run `pnpm test:integration` to verify

---

### 3. WhatsApp Reconnection with Exponential Backoff

**File:** `src/bot.ts`

#### Root Cause

The `disconnected` event handler at `src/bot.ts:85-87` only logs the reason. The bot stays dead after any connection drop in production — no reconnect attempt is made.

```ts
// Current — logs and dies
client.on('disconnected', (reason) => {
  log('🔌 Client disconnected:', reason);
});
```

#### Impact

- Production outage on any transient network disruption.
- Requires manual restart or external watchdog to recover.
- No visibility into reconnect attempts or failure patterns.

#### Fix Plan

Add exponential backoff retry on disconnect. Re-initialize the client on each attempt.

```ts
// Pseudocode
client.on('disconnected', async (reason) => {
  logger.warn({ reason }, 'client disconnected, attempting reconnect');
  let delay = 1000; // 1s initial
  const maxDelay = 300_000; // 5 min cap
  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(delay);
    try {
      await client.initialize();
      logger.info({ attempt }, 'reconnected');
      return;
    } catch (err) {
      logger.error({ err, attempt, nextDelayMs: delay * 2 }, 'reconnect failed');
      delay = Math.min(delay * 2, maxDelay);
    }
  }
  logger.fatal('max reconnect attempts reached, exiting');
  process.exit(1);
});
```

#### Steps

- [ ] Add reconnection logic to `disconnected` event in `src/bot.ts`
- [ ] Use exponential backoff: 1s → 2s → 4s → ... capped at 5 minutes
- [ ] Log each reconnect attempt with structured fields (attempt number, delay, reason)
- [ ] Exit process after max attempts (let container orchestrator restart)
- [ ] Verify by checking TypeScript compiles and reviewing log output

---

### 4. Remove Deprecated Fields from CommandContext

**Files:** `src/app/commandRouter.ts`, `src/app/messageHandler.ts`

#### Root Cause

`CommandContext` still carries `timezoneOffsetMinutes` and `now()` marked `@deprecated`. All 4 controllers have been migrated to `ctx.time.*`. The deprecated fields and their bridging code are dead weight.

```ts
// Current — dead code
export type CommandContext = {
  time: TimeContext;
  /** @deprecated */ timezoneOffsetMinutes: number;
  /** @deprecated */ now: () => Date;
};
```

#### Impact

- Confusing for future contributors — two ways to access the same data.
- Extra bridging code in `messageHandler.ts` that serves no purpose.
- TypeScript won't catch accidental use of the old fields until they're removed.

#### Fix Plan

Remove the two deprecated fields from `CommandContext` and the bridging assignments in `messageHandler.ts`. TypeScript will error if anything still references them.

#### Steps

- [ ] Remove `timezoneOffsetMinutes` and `now` from `CommandContext` type in `commandRouter.ts`
- [ ] Remove corresponding assignments in `messageHandler.ts`
- [ ] Run `pnpm tsc --noEmit` — fix any compile errors (should be none)
- [ ] Run tests

---

### 5. Structured Module-Level Logging

**Files:** `src/logger.ts`, module `index.ts` files, `src/bot.ts`, digest files

#### Root Cause

Only `messageHandler.ts` uses structured `createRequestLogger()`. Other files (18+) still use free-form `debug(string)` calls with emoji prefixes. There's no module-level context in log records, making it impossible to filter by module in production logs.

```ts
// Current — unstructured, no module context
debug('⏳ Loading:', percent + '%', message);
error('❌ Authentication failure:', msg);
```

#### Impact

- Cannot filter logs by module (e.g., `module=workout`) in log aggregation tools.
- Inconsistent log format between message handler and everything else.
- Harder to diagnose issues in specific modules.

#### Fix Plan

Each module registration function creates a child logger with `{ module: 'moduleName' }`. Thread the module logger through service constructors.

```ts
// src/modules/workouts/index.ts
import { rootLogger } from '../../logger.js';

export function registerWorkoutModule(deps: WorkoutModuleDeps) {
  const log = rootLogger.child({ module: 'workout' });
  const service = new WorkoutService(deps.workoutRepository, deps.listLimit, log);
  ...
}
```

**High-value targets:** `bot.ts`, `workoutDigest.ts`, `quranDigest.ts`, `remindScheduler.ts`

#### Steps

- [ ] Export `rootLogger` from `src/logger.ts` (if not already)
- [ ] Create child loggers with `{ module }` in each module's `index.ts`
- [ ] Thread logger through service/digest constructors
- [ ] Replace `debug()`/`log()`/`error()` calls in `bot.ts` with structured logger
- [ ] Replace in digest files and scheduler
- [ ] Run tests to verify no regressions

---

### 6. Drop `workouts_deprecated` Table

**File:** `src/db/migrations/`

#### Root Cause

Migration `0002_split_workouts_table.sql` renamed the old `workouts` table to `workouts_deprecated` as a safety net. After verifying production data integrity, this table should be dropped to avoid confusion.

#### Impact

- Dead table in the database that could confuse future developers.
- Minor: takes up disk space with stale data.

#### Fix Plan

```sql
-- Migration 0003
DROP TABLE IF EXISTS "workouts_deprecated";
```

#### Steps

- [ ] Verify production data is correct in `workout_lifts` and `workout_cardios`
- [ ] Write migration `0003_drop_workouts_deprecated.sql`
- [ ] Update `_journal.json` with new entry
- [ ] Run migrations on test DB to verify

---

### 7. CI Integration Test Pipeline

**Files:** `.github/workflows/`

#### Root Cause

Integration tests exist (`pnpm test:integration`) but no CI pipeline runs them. They only run manually on developer machines with a local PostgreSQL instance.

#### Impact

- Schema or query regressions can merge undetected.
- New contributors may not know integration tests exist or how to run them.

#### Fix Plan

Add a GitHub Actions workflow with a PostgreSQL service container.

```yaml
# .github/workflows/integration.yml
jobs:
  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: wabot
          POSTGRES_PASSWORD: wabot
          POSTGRES_DB: wabot_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: pnpm install
      - run: pnpm test:integration
        env:
          TEST_DATABASE_URL: postgresql://wabot:wabot@localhost:5432/wabot_test
```

#### Steps

- [ ] Create `.github/workflows/integration.yml`
- [ ] Configure PostgreSQL service container
- [ ] Run `pnpm test:integration` with `TEST_DATABASE_URL`
- [ ] Verify workflow passes on a test PR

---

## Priority Order

| # | Improvement | Effort | Risk | Priority |
|---|---|---|---|---|
| 4 | Remove deprecated CommandContext fields | XS | None | **Do first** |
| 6 | Drop `workouts_deprecated` table | XS | None | **Do first** |
| 1 | Quran `user` → `user_id` rename | S | Low (migration) | **Do first** |
| 2 | Integration tests for Quran + Sholat | M | None | **Do next** |
| 7 | CI integration test pipeline | S | None | **Do next** |
| 3 | WhatsApp reconnection with backoff | M | Low | **Do next** |
| 5 | Structured module-level logging | M | None | **Plan later** |

---

## How to Use This Document

1. Pick one item from the top of the priority list.
2. Follow its **Steps** checklist — check off each box as you complete it.
3. Open a focused branch per improvement (e.g., `refactor/quran-user-id-rename`).
4. Write or update tests as part of the same branch — do not defer tests.
5. Mark steps done in this file after merging.

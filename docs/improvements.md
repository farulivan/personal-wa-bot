# Architecture Improvement Plan

Architecture review score: **7.5 / 10**. Eight improvements to push the architecture from solid to excellent.

---

## Table of Contents

- [Score Breakdown](#score-breakdown)
- [Phase 1: Quick Wins](#phase-1-quick-wins)
- [Phase 2: Config Validation](#phase-2-config-validation)
- [Phase 3: Test Coverage](#phase-3-test-coverage)
- [Phase 4: Logging Cleanup](#phase-4-logging-cleanup)
- [Phase 5: Schema Hardening](#phase-5-schema-hardening)
- [Items Not Proposed](#items-not-proposed)
- [Priority Order](#priority-order)

---

## Score Breakdown

| Area | Score | Notes |
|------|-------|-------|
| Module structure & consistency | 9/10 | Every module follows parser->service->controller->presenter->infra. Textbook clean. |
| Separation of concerns | 9/10 | Hexagonal architecture properly applied. Services never touch infra. |
| Composition root / DI | 8/10 | Explicit, no DI framework. Correct approach for this scale. |
| Result type / error modeling | 8/10 | Consistent `Result<T>` for expected failures. Clean pattern. |
| Repository layer | 8/10 | Clean interfaces, good Drizzle usage, no N+1. Missing some indexes. |
| Documentation | 9/10 | Excellent README, architecture guide. Well above average. |
| Code duplication | 7/10 | Streak logic similar between modules but intentionally separate (will diverge). |
| Error handling | 6/10 | Error boundary exists but generic. Auth normalization inconsistency. |
| Test coverage | 5/10 | Strong parser/service tests for 2 modules. Zero tests for quran, sholat, users. |
| Config & validation | 5/10 | Centralized but no runtime validation. Silent fallbacks on bad input. |
| Logging & observability | 5/10 | Pino used inconsistently. `debugError()` is dead code. |
| CI/CD & operational readiness | 5/10 | Unit tests in CI only. No integration tests in pipeline. |

---

## Phase 1: Quick Wins

### 1. Fix Auth Normalization Inconsistency

**Files:** `src/app/authGuard.ts`, `src/app/normalizeUserId.ts`

#### Root Cause

`authGuard.ts:5` uses `/@.*$/` (strips any suffix), while `normalizeUserId.ts:11` uses `/@(c\.us|lid|g\.us)$/` (specific suffixes only). Different regex = potential auth bypass if an unusual suffix appears. A user could pass auth but get a different userId in the DB.

#### Fix

Replace `phoneNumber.replace(/@.*$/, '')` with `normalizeUserId(phoneNumber)` in `authGuard.ts`. Single source of truth for ID normalization.

#### Steps

- [ ] Update `src/app/authGuard.ts` to import and use `normalizeUserId`
- [ ] Run `pnpm verify && pnpm test`

---

### 2. Remove `debugError()` Dead Code

**Files:** `src/logger.ts`

#### Root Cause

`debugError()` at `src/logger.ts:26-32` is byte-for-byte identical to `debug()`. Dead weight that confuses contributors.

#### Fix

Remove the function. Replace any usages with `debug`.

#### Steps

- [ ] Remove `debugError` from `src/logger.ts`
- [ ] Grep for usages and replace with `debug`
- [ ] Run `pnpm verify && pnpm test`

---

### 3. Escalate Scheduler Job Failures

**Files:** `src/app/scheduler.ts`

#### Root Cause

`scheduler.ts:36` logs job failures at debug level. A daily digest that fails every day is invisible in production.

#### Fix

Change `debug(...)` to `error(...)` in the job `.catch()` handler.

#### Steps

- [ ] Update `src/app/scheduler.ts:36` to use `error` instead of `debug`
- [ ] Run `pnpm verify && pnpm test`

---

## Phase 2: Config Validation

### 4. Add Startup Config Validation

**Files:** `src/config/env.ts`, `src/index.ts`

#### Root Cause

Config silently accepts garbage: `DATABASE_URL` can be empty, hour values can be 99, `QURAN_RAMADHAN_COUNT_ENABLED=true` without dates silently breaks. Bugs surface late and cryptically.

#### Fix

Add a `validateConfig()` function in `env.ts`. Call it from `index.ts` before anything starts, replacing the manual `DATABASE_URL` check.

#### Validation Rules

- `DATABASE_URL` must be non-empty
- `dailyDigestHour`: 0-23, `dailyDigestMinute`: 0-59
- `quranReminderHour`: 0-23, `quranReminderMinute`: 0-59
- `minWorkoutsForStreak`: >= 1
- If `quranRamadhanCountEnabled`, start and end dates must be non-empty valid ISO dates
- Warn (don't throw) if `allowedNumbers` is empty

No zod needed. A plain function with if-statements is adequate.

#### Steps

- [ ] Add `validateConfig()` to `src/config/env.ts`
- [ ] Replace manual `DATABASE_URL` check in `src/index.ts` with `validateConfig(appConfig)`
- [ ] Run `pnpm verify && pnpm test`

---

## Phase 3: Test Coverage

### 5. Quran Parser and Service Tests

**Files:** `src/modules/quran/quranParser.ts`, `src/modules/quran/quranService.ts`

#### Root Cause

Quran module has complex parsing (page counts, `--no-mark` flag, mark validation) and service logic (khatam detection, page 604 reset, daily accumulation) with zero test coverage.

#### Fix

Create test files following existing patterns (workoutParser.test.ts, workoutService.test.ts).

**Parser test cases:**
- Valid read count, zero/negative/decimal rejected
- `--no-mark` flag parsing
- Mark page validation (1-604)

**Service test cases (in-memory repo):**
- Daily read accumulation
- Mark auto-advance after read
- Khatam reset at page 604
- `--no-mark` skips mark update

#### Steps

- [ ] Create `src/modules/quran/quranParser.test.ts`
- [ ] Create `src/modules/quran/quranService.test.ts` with in-memory repo
- [ ] Run `pnpm test`

---

### 6. Sholat Service Tests

**Files:** `src/modules/sholat/sholatService.ts`

#### Root Cause

Sholat has non-trivial logic (location catalog caching, 404 self-healing refresh, schedule lookup fallback) that's completely untested.

#### Fix

Create test file with mock repository and HTTP client.

**Test cases:**
- Fresh schedule fetch and cache
- Cache hit (no API call)
- 404 triggers catalog refresh
- Unknown location error

#### Steps

- [ ] Create `src/modules/sholat/sholatService.test.ts`
- [ ] Run `pnpm test`

---

## Phase 4: Logging Cleanup

### 7. Structured Pino Usage

**Files:** `src/logger.ts`, `src/app/scheduler.ts`, `src/index.ts`, `src/bot.ts`, `src/app/authGuard.ts`

#### Root Cause

Half the codebase uses structured logging (`reqLog.info({ namespace, durationMs }, 'command handled')`), the other half uses unstructured calls (`debug('emoji string interpolation')`). Defeats the purpose of using Pino.

#### Fix

- Export `rootLogger` from `logger.ts`
- Fix convenience wrappers to accept object as first arg (matching Pino convention)
- Update the 5-6 highest-traffic log sites to use structured logging
- Remove emoji prefixes from log messages (noise in structured log aggregation)

Don't boil the ocean converting every call. Focus on high-traffic sites.

#### Steps

- [ ] Update `src/logger.ts` — export `rootLogger`, fix wrapper signatures
- [ ] Update key files: `scheduler.ts`, `index.ts`, `bot.ts`, `authGuard.ts`
- [ ] Run `pnpm verify && pnpm test`

---

## Phase 5: Schema Hardening

### 8. Add Missing Workout Table Indexes

**Files:** `src/modules/workouts/infra/schema.ts`

#### Root Cause

`workout_lifts` and `workout_cardios` have no indexes on `(user_id, created_at)` despite being queried by user+date in list, streak, and count operations. Quran and remind schemas already have proper indexes.

#### Fix

Add composite indexes to both tables. Generate migration.

#### Steps

- [ ] Add indexes to `src/modules/workouts/infra/schema.ts`
- [ ] Run `pnpm db:generate`
- [ ] Run `pnpm verify && pnpm test`

---

## Items Not Proposed

| Suggestion | Why skip it |
|---|---|
| Unify streak logic into shared utility | Workouts and quran are independent modules that will diverge. Per-module ownership avoids coupling. |
| DI container / module loader | Explicit wiring in index.ts is correct at this scale. |
| Error type hierarchy | Result type handles expected errors. withErrorBoundary handles unexpected ones. |
| Retry logic in message gateway | 3-tier fallback already robust for WA quirks. |
| AsyncLocalStorage for request context | Overkill for linear message flows. |
| Auto-discovering schemas via glob | 6 lines of manual exports is clearer than glob magic. |
| Zod for config validation | Plain if-statements are adequate at this scale. |
| Rate limiting on auth failures | Personal bot with phone allowlist. Minimal attack surface. |

---

## Priority Order

| Phase | Improvement | Effort | Impact |
|---|---|---|---|
| 1 | Fix auth normalization inconsistency | XS | High |
| 1 | Remove `debugError()` dead code | XS | Low |
| 1 | Escalate scheduler job failures | XS | Medium |
| 2 | Add startup config validation | S | High |
| 3 | Quran parser + service tests | M | High |
| 3 | Sholat service tests | M | Medium |
| 4 | Structured Pino logging | M | Medium |
| 5 | Workout table indexes | S | Low |

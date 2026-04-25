import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleWorkoutRepository } from './drizzleWorkoutRepository.js';
import { setupTestDb, cleanAllTables } from '../../../db/testHelper.js';
import type { DrizzleDb } from '../../../db/drizzle.js';

const TZ = 420; // UTC+7
const user = 'test-user-1';

describe('DrizzleWorkoutRepository', () => {
  let db: DrizzleDb;
  let close: () => Promise<void>;
  let repo: DrizzleWorkoutRepository;

  beforeAll(async () => {
    ({ db, close } = await setupTestDb());
    repo = new DrizzleWorkoutRepository(db, 3);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await cleanAllTables(db);
  });

  describe('insertWorkoutLog + countByUser', () => {
    it('inserts a lift and counts it', async () => {
      await repo.insertWorkoutLog({
        userId: user,
        workoutMode: 'lift',
        type: 'bench',
        reps: 10,
        sets: 3,
        weight: 60,
        createdAtIso: '2026-04-12T10:00:00.000Z',
      });

      expect(await repo.countByUser(user)).toBe(1);
      expect(await repo.countByUser('other-user')).toBe(0);
    });

    it('inserts a cardio and counts it', async () => {
      await repo.insertWorkoutLog({
        userId: user,
        workoutMode: 'cardio',
        type: 'run',
        durationMinutes: 30,
        distanceKm: 5,
        createdAtIso: '2026-04-12T10:00:00.000Z',
      });

      expect(await repo.countByUser(user)).toBe(1);
    });
  });

  describe('listByUser', () => {
    it('returns entries ordered by createdAt DESC', async () => {
      await repo.insertWorkoutLog({
        userId: user,
        workoutMode: 'lift',
        type: 'bench',
        reps: 10,
        sets: 3,
        weight: 60,
        createdAtIso: '2026-04-12T08:00:00.000Z',
      });
      await repo.insertWorkoutLog({
        userId: user,
        workoutMode: 'cardio',
        type: 'run',
        durationMinutes: 30,
        distanceKm: 5,
        createdAtIso: '2026-04-12T10:00:00.000Z',
      });

      const rows = await repo.listByUser(user, 10, 0);
      expect(rows).toHaveLength(2);
      expect(rows[0].type).toBe('run');
      expect(rows[1].type).toBe('bench');
    });

    it('respects limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.insertWorkoutLog({
          userId: user,
          workoutMode: 'lift',
          type: `exercise-${i}`,
          reps: 10,
          sets: 3,
          weight: 0,
          createdAtIso: `2026-04-12T${String(i + 8).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const page = await repo.listByUser(user, 2, 2);
      expect(page).toHaveLength(2);
    });
  });

  describe('listDistinctUsers', () => {
    it('returns unique user IDs', async () => {
      await repo.insertWorkoutLog({
        userId: 'user-a',
        workoutMode: 'lift',
        type: 'bench',
        reps: 10,
        sets: 3,
        weight: 60,
        createdAtIso: '2026-04-12T10:00:00.000Z',
      });
      await repo.insertWorkoutLog({
        userId: 'user-b',
        workoutMode: 'lift',
        type: 'squat',
        reps: 8,
        sets: 4,
        weight: 80,
        createdAtIso: '2026-04-12T10:00:00.000Z',
      });
      await repo.insertWorkoutLog({
        userId: 'user-a',
        workoutMode: 'cardio',
        type: 'run',
        durationMinutes: 30,
        distanceKm: 5,
        createdAtIso: '2026-04-12T11:00:00.000Z',
      });

      const users = await repo.listDistinctUsers();
      expect(users.sort()).toEqual(['user-a', 'user-b']);
    });
  });

  describe('getTodayCount', () => {
    it('counts only workouts from the same user-local day', async () => {
      const now = '2026-04-12T10:00:00.000Z';
      // Same day in UTC+7
      await repo.insertWorkoutLog({
        userId: user,
        workoutMode: 'lift',
        type: 'bench',
        reps: 10,
        sets: 3,
        weight: 60,
        createdAtIso: '2026-04-12T01:00:00.000Z',
      });
      // Previous day in UTC+7 (2026-04-11 23:00 UTC = 2026-04-12 06:00 UTC+7)
      // Actually 2026-04-11T16:00 UTC = 2026-04-11 23:00 UTC+7 — previous day
      await repo.insertWorkoutLog({
        userId: user,
        workoutMode: 'lift',
        type: 'squat',
        reps: 8,
        sets: 4,
        weight: 80,
        createdAtIso: '2026-04-11T16:00:00.000Z',
      });

      const count = await repo.getTodayCount(user, TZ, now);
      expect(count).toBe(1);
    });
  });

  describe('getQualifyingStreakDays', () => {
    it('returns days where workout count meets minimum threshold', async () => {
      // Day 1: 3 workouts (qualifies with minWorkoutsForStreak=3)
      for (let i = 0; i < 3; i++) {
        await repo.insertWorkoutLog({
          userId: user,
          workoutMode: 'lift',
          type: `exercise-${i}`,
          reps: 10,
          sets: 3,
          weight: 0,
          createdAtIso: `2026-04-12T${String(i + 1).padStart(2, '0')}:00:00.000Z`,
        });
      }

      // Day 2: only 1 workout (does NOT qualify)
      await repo.insertWorkoutLog({
        userId: user,
        workoutMode: 'lift',
        type: 'bench',
        reps: 10,
        sets: 3,
        weight: 60,
        createdAtIso: '2026-04-11T01:00:00.000Z',
      });

      const days = await repo.getQualifyingStreakDays(user, TZ);
      expect(days).toHaveLength(1);
    });

    it('returns empty array when no qualifying days', async () => {
      await repo.insertWorkoutLog({
        userId: user,
        workoutMode: 'lift',
        type: 'bench',
        reps: 10,
        sets: 3,
        weight: 60,
        createdAtIso: '2026-04-12T01:00:00.000Z',
      });

      const days = await repo.getQualifyingStreakDays(user, TZ);
      expect(days).toHaveLength(0);
    });
  });

  describe('countSessionsByUserInDateRange', () => {
    const makeLift = (userId: string, createdAtIso: string) =>
      repo.insertWorkoutLog({
        userId,
        workoutMode: 'lift',
        type: 'bench',
        reps: 10,
        sets: 3,
        weight: 60,
        createdAtIso,
      });

    const makeCardio = (userId: string, createdAtIso: string) =>
      repo.insertWorkoutLog({
        userId,
        workoutMode: 'cardio',
        type: 'run',
        durationMinutes: 30,
        distanceKm: 5,
        createdAtIso,
      });

    it('counts lift and cardio in range together', async () => {
      // Both rows fall in April 2026 (UTC+7 local)
      await makeLift(user, '2026-04-12T03:00:00.000Z'); // 2026-04-12 10:00 UTC+7
      await makeCardio(user, '2026-04-15T03:00:00.000Z'); // 2026-04-15 10:00 UTC+7

      const count = await repo.countSessionsByUserInDateRange(user, TZ, '2026-04-01', '2026-04-30');
      expect(count).toBe(2);
    });

    it('excludes rows from previous month', async () => {
      // March row — outside April range
      await makeLift(user, '2026-03-20T03:00:00.000Z'); // 2026-03-20 10:00 UTC+7

      const count = await repo.countSessionsByUserInDateRange(user, TZ, '2026-04-01', '2026-04-30');
      expect(count).toBe(0);
    });

    it('excludes soft-deleted rows', async () => {
      await makeLift(user, '2026-04-12T03:00:00.000Z'); // will be soft-deleted
      await makeCardio(user, '2026-04-13T03:00:00.000Z'); // stays active

      // Soft-delete the lift row via findLastByUser on the lift
      // Insert an extra lift so findLastByUser returns the one we want to delete.
      // Strategy: insert the cardio last so findLastByUser returns it — instead,
      // insert lift after cardio so it's the most recent, then delete it.
      // Re-insert in the order: cardio first, then lift.
      await cleanAllTables(db);
      await makeCardio(user, '2026-04-13T03:00:00.000Z');
      await makeLift(user, '2026-04-14T03:00:00.000Z'); // most recent → returned by findLastByUser

      const last = await repo.findLastByUser(user);
      expect(last).not.toBeNull();
      await repo.softDeleteById(last!.id, last!.workoutMode, '2026-04-14T04:00:00.000Z');

      const count = await repo.countSessionsByUserInDateRange(user, TZ, '2026-04-01', '2026-04-30');
      expect(count).toBe(1); // only the cardio survives
    });

    it("excludes other users' rows", async () => {
      const other = 'other-user-2';
      await makeLift(user, '2026-04-12T03:00:00.000Z');
      await makeCardio(user, '2026-04-13T03:00:00.000Z');
      await makeLift(other, '2026-04-12T03:00:00.000Z');

      const countUser = await repo.countSessionsByUserInDateRange(
        user,
        TZ,
        '2026-04-01',
        '2026-04-30'
      );
      const countOther = await repo.countSessionsByUserInDateRange(
        other,
        TZ,
        '2026-04-01',
        '2026-04-30'
      );

      expect(countUser).toBe(2);
      expect(countOther).toBe(1);
    });

    it('handles timezone boundary correctly', async () => {
      // TZ = UTC+7 (420 minutes)
      // Row A: created_at = 2026-04-01T02:00:00Z → local 2026-04-01 09:00 → counts in April
      await makeLift(user, '2026-04-01T02:00:00.000Z');
      // Row B: created_at = 2026-04-30T17:30:00Z → local 2026-05-01 00:30 → does NOT count in April
      await makeCardio(user, '2026-04-30T17:30:00.000Z');

      const countApril = await repo.countSessionsByUserInDateRange(
        user,
        TZ,
        '2026-04-01',
        '2026-04-30'
      );
      // Only row A falls in April local time
      expect(countApril).toBe(1);

      // Row B should count in May
      const countMay = await repo.countSessionsByUserInDateRange(
        user,
        TZ,
        '2026-05-01',
        '2026-05-31'
      );
      expect(countMay).toBe(1);
    });
  });
});

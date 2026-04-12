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
});

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkoutService } from './workoutService.js';
import type { WorkoutRepository, WorkoutEntry, NewWorkoutLog } from './infra/workoutRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';

class InMemoryWorkoutRepository implements WorkoutRepository {
  private logs: (NewWorkoutLog & { id: number })[] = [];
  private nextId = 1;

  async insertWorkoutLog(log: NewWorkoutLog): Promise<void> {
    this.logs.push({ ...log, id: this.nextId++ });
  }

  async countByUser(user: string): Promise<number> {
    return this.logs.filter((l) => l.user === user).length;
  }

  async listByUser(user: string, limit: number, offset: number): Promise<WorkoutEntry[]> {
    return this.logs
      .filter((l) => l.user === user)
      .slice(offset, offset + limit)
      .map((l) => ({
        createdAt: l.createdAtIso,
        workoutMode: l.workoutMode,
        type: l.type,
        reps: l.reps,
        sets: l.sets,
        weight: l.weight,
        durationMinutes: l.durationMinutes,
        distanceKm: l.distanceKm,
      }));
  }

  async listDistinctUsers(): Promise<string[]> {
    return [...new Set(this.logs.map((l) => l.user))];
  }

  async getQualifyingStreakDays(user: string, _tz: number): Promise<string[]> {
    const countsByDay = new Map<string, number>();
    for (const log of this.logs.filter((l) => l.user === user)) {
      const day = log.createdAtIso.slice(0, 10);
      countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1);
    }
    return [...countsByDay.entries()]
      .filter(([, count]) => count >= this.minForStreak)
      .map(([day]) => day)
      .sort()
      .reverse();
  }

  async getTodayCount(user: string, _tz: number, nowIso: string): Promise<number> {
    const today = nowIso.slice(0, 10);
    return this.logs.filter((l) => l.user === user && l.createdAtIso.slice(0, 10) === today).length;
  }

  constructor(public readonly minForStreak: number = 3) {}
}

class InMemoryUserRepository implements UserRepository {
  async upsert(): Promise<void> {}
  async findById(): Promise<null> {
    return null;
  }
  async findByIds(): Promise<[]> {
    return [];
  }
  async getDisplayName(userId: string): Promise<string> {
    return userId;
  }
}

describe('WorkoutService', () => {
  let repo: InMemoryWorkoutRepository;
  let userRepo: InMemoryUserRepository;
  let service: WorkoutService;

  const TZ = 420;
  const now = new Date('2026-04-08T10:00:00Z');
  const user = '628111111111@c.us';

  beforeEach(() => {
    repo = new InMemoryWorkoutRepository(3);
    userRepo = new InMemoryUserRepository();
    service = new WorkoutService(repo, userRepo, 3, 10);
  });

  describe('logLift', () => {
    it('inserts a lift log', async () => {
      await service.logLift(
        user,
        { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 60 },
        now
      );
      expect(await repo.countByUser(user)).toBe(1);
    });
  });

  describe('logCardio', () => {
    it('inserts a cardio log', async () => {
      await service.logCardio(
        user,
        { mode: 'cardio', activity: 'run', durationMinutes: 30, distanceKm: 5 },
        now
      );
      expect(await repo.countByUser(user)).toBe(1);
    });
  });

  describe('getStreakAfterLog', () => {
    it('returns todayCount and null streaks when below threshold', async () => {
      await service.logLift(
        user,
        { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 0 },
        now
      );
      const result = await service.getStreakAfterLog(user, TZ, now);
      expect(result.todayCount).toBe(1);
      expect(result.streaks).toBeNull();
    });

    it('returns streak info when threshold reached', async () => {
      for (let i = 0; i < 3; i++) {
        await service.logLift(
          user,
          { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 0 },
          now
        );
      }
      const result = await service.getStreakAfterLog(user, TZ, now);
      expect(result.todayCount).toBe(3);
      expect(result.streaks).not.toBeNull();
    });
  });

  describe('listWorkouts', () => {
    it('returns empty result for new user', async () => {
      const result = await service.listWorkouts(user, 1, TZ, now);
      expect(result.total).toBe(0);
      expect(result.rows).toHaveLength(0);
      expect(result.totalPages).toBe(1);
    });

    it('paginates correctly', async () => {
      for (let i = 0; i < 12; i++) {
        await service.logLift(
          user,
          { mode: 'lift', activity: `exercise${i}`, reps: 10, sets: 3, weight: 0 },
          now
        );
      }
      const page1 = await service.listWorkouts(user, 1, TZ, now);
      expect(page1.total).toBe(12);
      expect(page1.totalPages).toBe(2);
      expect(page1.rows).toHaveLength(10);

      const page2 = await service.listWorkouts(user, 2, TZ, now);
      expect(page2.rows).toHaveLength(2);
    });

    it('returns empty rows for page beyond total', async () => {
      await service.logLift(
        user,
        { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 0 },
        now
      );
      const result = await service.listWorkouts(user, 99, TZ, now);
      expect(result.rows).toHaveLength(0);
    });
  });
});

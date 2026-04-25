import { describe, it, expect, beforeEach } from 'vitest';
import { WorkoutService } from './workoutService.js';
import type {
  WorkoutRepository,
  WorkoutEntry,
  NewWorkoutLog,
  DeletedWorkoutEntry,
} from './infra/workoutRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import { rankLeaderboardEntries } from './workoutPresenter.js';

class InMemoryWorkoutRepository implements WorkoutRepository {
  private logs: (NewWorkoutLog & { id: number; deletedAt: string | null })[] = [];
  private nextId = 1;

  private active() {
    return this.logs.filter((l) => l.deletedAt === null);
  }

  async insertWorkoutLog(log: NewWorkoutLog): Promise<void> {
    this.logs.push({ ...log, id: this.nextId++, deletedAt: null });
  }

  async countByUser(user: string): Promise<number> {
    return this.active().filter((l) => l.userId === user).length;
  }

  async countSessionsByUserInDateRange(
    user: string,
    timezoneOffsetMinutes: number,
    startDateInclusive: string,
    endDateInclusive: string
  ): Promise<number> {
    return this.active().filter((l) => {
      if (l.userId !== user) return false;
      const localMs = new Date(l.createdAtIso).getTime() + timezoneOffsetMinutes * 60 * 1000;
      const localDay = new Date(localMs).toISOString().slice(0, 10);
      return localDay >= startDateInclusive && localDay <= endDateInclusive;
    }).length;
  }

  async listByUser(user: string, limit: number, offset: number): Promise<WorkoutEntry[]> {
    return this.active()
      .filter((l) => l.userId === user)
      .slice(offset, offset + limit)
      .map((l): WorkoutEntry => {
        if (l.workoutMode === 'cardio') {
          return {
            createdAt: l.createdAtIso,
            workoutMode: 'cardio',
            type: l.type,
            durationMinutes: l.durationMinutes,
            distanceKm: l.distanceKm,
          };
        }
        return {
          createdAt: l.createdAtIso,
          workoutMode: 'lift',
          type: l.type,
          reps: l.reps,
          sets: l.sets,
          weight: l.weight,
        };
      });
  }

  async listDistinctUsers(): Promise<string[]> {
    return [...new Set(this.active().map((l) => l.userId))];
  }

  async getQualifyingStreakDays(user: string, _tz: number): Promise<string[]> {
    const countsByDay = new Map<string, number>();
    for (const log of this.active().filter((l) => l.userId === user)) {
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
    return this.active().filter((l) => l.userId === user && l.createdAtIso.slice(0, 10) === today)
      .length;
  }

  async findLastByUser(user: string): Promise<DeletedWorkoutEntry | null> {
    const userLogs = this.active()
      .filter((l) => l.userId === user)
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));

    if (userLogs.length === 0) return null;

    const l = userLogs[0];
    if (l.workoutMode === 'cardio') {
      return {
        id: l.id,
        createdAt: l.createdAtIso,
        workoutMode: 'cardio',
        type: l.type,
        durationMinutes: l.durationMinutes,
        distanceKm: l.distanceKm,
      };
    }
    return {
      id: l.id,
      createdAt: l.createdAtIso,
      workoutMode: 'lift',
      type: l.type,
      reps: l.reps,
      sets: l.sets,
      weight: l.weight,
    };
  }

  async softDeleteById(
    id: number,
    _workoutMode: 'lift' | 'cardio',
    deletedAtIso: string
  ): Promise<void> {
    const log = this.logs.find((l) => l.id === id);
    if (log) log.deletedAt = deletedAtIso;
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

  describe('undoLastLog', () => {
    it('returns no_logs when user has no logs', async () => {
      const result = await service.undoLastLog(user, now);
      expect(result.undone).toBe(false);
      if (!result.undone) {
        expect(result.reason).toBe('no_logs');
      }
    });

    it('undoes the most recent lift within 5 minutes', async () => {
      await service.logLift(
        user,
        { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 60 },
        now
      );
      const undoTime = new Date(now.getTime() + 2 * 60 * 1000); // 2 min later
      const result = await service.undoLastLog(user, undoTime);
      expect(result.undone).toBe(true);
      if (result.undone) {
        expect(result.entry.workoutMode).toBe('lift');
        expect(result.entry.type).toBe('bench');
      }
      expect(await repo.countByUser(user)).toBe(0);
    });

    it('undoes the most recent cardio when it is newer than lift', async () => {
      const earlier = new Date('2026-04-08T09:00:00Z');
      await service.logLift(
        user,
        { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 60 },
        earlier
      );
      await service.logCardio(
        user,
        { mode: 'cardio', activity: 'run', durationMinutes: 30, distanceKm: 5 },
        now
      );
      const undoTime = new Date(now.getTime() + 1 * 60 * 1000);
      const result = await service.undoLastLog(user, undoTime);
      expect(result.undone).toBe(true);
      if (result.undone) {
        expect(result.entry.workoutMode).toBe('cardio');
        expect(result.entry.type).toBe('run');
      }
      expect(await repo.countByUser(user)).toBe(1);
    });

    it('rejects undo after 5 minutes with too_late and shows entry', async () => {
      await service.logLift(
        user,
        { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 60 },
        now
      );
      const tooLate = new Date(now.getTime() + 6 * 60 * 1000); // 6 min later
      const result = await service.undoLastLog(user, tooLate);
      expect(result.undone).toBe(false);
      if (!result.undone) {
        expect(result.reason).toBe('too_late');
        if (result.reason === 'too_late') {
          expect(result.entry.type).toBe('bench');
        }
      }
      expect(await repo.countByUser(user)).toBe(1);
    });

    it('does not return soft-deleted entries on second undo', async () => {
      await service.logLift(
        user,
        { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 0 },
        now
      );
      await service.undoLastLog(user, new Date(now.getTime() + 1000));
      const result = await service.undoLastLog(user, new Date(now.getTime() + 2000));
      expect(result.undone).toBe(false);
      if (!result.undone) {
        expect(result.reason).toBe('no_logs');
      }
    });

    it('soft-deleted entries are excluded from countByUser and listWorkouts', async () => {
      await service.logLift(
        user,
        { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 0 },
        now
      );
      await service.logLift(
        user,
        { mode: 'lift', activity: 'squat', reps: 8, sets: 4, weight: 80 },
        new Date(now.getTime() + 1000)
      );
      await service.undoLastLog(user, new Date(now.getTime() + 2000));

      expect(await repo.countByUser(user)).toBe(1);
      const list = await service.listWorkouts(user, 1, TZ, now);
      expect(list.total).toBe(1);
      expect(list.rows[0].type).toBe('bench');
    });
  });

  describe('getLeaderboard', () => {
    const TZ = 420;
    const now = new Date('2026-04-08T10:00:00Z');
    const userA = '628111111111@c.us';
    const userB = '628222222222@c.us';

    it('returns empty entries when repo is empty', async () => {
      const result = await service.getLeaderboard(TZ, now);
      expect(result.entries).toHaveLength(0);
    });

    it('counts one lift + one cardio as sessionsInMonth === 2 for a single user', async () => {
      await service.logLift(
        userA,
        { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 60 },
        now
      );
      await service.logCardio(
        userA,
        { mode: 'cardio', activity: 'run', durationMinutes: 30, distanceKm: 5 },
        now
      );
      const result = await service.getLeaderboard(TZ, now);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].sessionsInMonth).toBe(2);
    });

    it('two users: each has correct sessionsInMonth regardless of streak (service returns unsorted)', async () => {
      // userA: 3 sessions, no streak qualifying days (repo minForStreak=3, all on same day)
      for (let i = 0; i < 3; i++) {
        await service.logLift(
          userA,
          { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 60 },
          now
        );
      }
      // userB: 1 session — fewer sessions but logged on a qualifying day with streak
      await service.logLift(
        userB,
        { mode: 'lift', activity: 'squat', reps: 8, sets: 4, weight: 80 },
        now
      );

      const result = await service.getLeaderboard(TZ, now);
      const entryA = result.entries.find((e) => e.user === userA);
      const entryB = result.entries.find((e) => e.user === userB);

      expect(entryA?.sessionsInMonth).toBe(3);
      expect(entryB?.sessionsInMonth).toBe(1);

      // Primary metric wins when ranked
      const ranked = rankLeaderboardEntries(result.entries);
      expect(ranked[0].user).toBe(userA);
    });

    it('soft-deleted entries are excluded from sessionsInMonth', async () => {
      await service.logLift(
        userA,
        { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 60 },
        now
      );
      await service.logLift(
        userA,
        { mode: 'lift', activity: 'squat', reps: 8, sets: 4, weight: 80 },
        new Date(now.getTime() + 1000)
      );
      // Undo the last log (soft-delete)
      await service.undoLastLog(userA, new Date(now.getTime() + 2000));

      const result = await service.getLeaderboard(TZ, now);
      const entry = result.entries.find((e) => e.user === userA);
      expect(entry?.sessionsInMonth).toBe(1);
    });

    it('out-of-month entries are excluded from sessionsInMonth', async () => {
      // Insert a workout in March (previous month)
      const marchDate = new Date('2026-03-15T10:00:00Z');
      await service.logLift(
        userA,
        { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 60 },
        marchDate
      );
      // Insert a workout in April (current month, for `now`)
      await service.logLift(
        userA,
        { mode: 'lift', activity: 'squat', reps: 8, sets: 4, weight: 80 },
        now
      );

      // getLeaderboard uses `now` (April 2026), so March entry should not count
      const result = await service.getLeaderboard(TZ, now);
      const entry = result.entries.find((e) => e.user === userA);
      expect(entry?.sessionsInMonth).toBe(1);
    });

    it('display name resolution uses userRepository.getDisplayName', async () => {
      // Extend InMemoryUserRepository with a known mapping for this test
      const nameMap = new Map<string, string>([[userA, 'Farul']]);
      const customUserRepo: UserRepository = {
        async upsert() {},
        async findById() {
          return null;
        },
        async findByIds() {
          return [];
        },
        async getDisplayName(userId: string) {
          return nameMap.get(userId) ?? userId;
        },
      };
      const customService = new WorkoutService(repo, customUserRepo, 3, 10);

      await service.logLift(
        userA,
        { mode: 'lift', activity: 'bench', reps: 10, sets: 3, weight: 60 },
        now
      );

      // Use customService which shares the same repo but has a custom userRepo
      const result = await customService.getLeaderboard(TZ, now);
      const entry = result.entries.find((e) => e.user === 'Farul');
      expect(entry).toBeDefined();
      expect(entry?.user).toBe('Farul');
    });
  });
});

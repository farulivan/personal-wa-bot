import { describe, it, expect, beforeEach } from 'vitest';
import { QuranService } from './quranService.js';
import type {
  QuranRepository,
  NewQuranReadLog,
  QuranDailyReadRow,
  QuranHistoryRow,
  QuranMarkRow,
  QuranStreakDateRange,
} from './infra/quranRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';

class InMemoryQuranRepository implements QuranRepository {
  dailyReads: QuranDailyReadRow[] = [];
  marks: QuranMarkRow[] = [];

  async addDailyReadPages(input: NewQuranReadLog): Promise<void> {
    const dateKey = input.nowIsoUtc.slice(0, 10);
    const existing = this.dailyReads.find(
      (r) => r.user === input.user && r.createdAtUtc.slice(0, 10) === dateKey
    );
    if (existing) {
      existing.pages += input.pages;
      existing.updatedAtUtc = input.updatedAtUtc;
    } else {
      this.dailyReads.push({
        user: input.user,
        pages: input.pages,
        createdAtUtc: input.createdAtIsoUtc,
        updatedAtUtc: input.updatedAtUtc,
      });
    }
  }

  async findTodayByUser(
    user: string,
    _tz: number,
    nowIsoUtc: string
  ): Promise<QuranDailyReadRow | null> {
    const dateKey = nowIsoUtc.slice(0, 10);
    return (
      this.dailyReads.find((r) => r.user === user && r.createdAtUtc.slice(0, 10) === dateKey) ??
      null
    );
  }

  async hasReadTodayByUser(user: string, _tz: number, nowIsoUtc: string): Promise<boolean> {
    const dateKey = nowIsoUtc.slice(0, 10);
    return this.dailyReads.some((r) => r.user === user && r.createdAtUtc.slice(0, 10) === dateKey);
  }

  async countByUser(user: string): Promise<number> {
    return this.dailyReads.filter((r) => r.user === user).length;
  }

  async sumPagesByUser(user: string): Promise<number> {
    return this.dailyReads.filter((r) => r.user === user).reduce((sum, r) => sum + r.pages, 0);
  }

  async sumPagesByUserInDateRange(
    user: string,
    _tz: number,
    start: string,
    end: string
  ): Promise<number> {
    return this.dailyReads
      .filter((r) => {
        if (r.user !== user) return false;
        const d = r.createdAtUtc.slice(0, 10);
        return d >= start && d <= end;
      })
      .reduce((sum, r) => sum + r.pages, 0);
  }

  async upsertMark(
    user: string,
    page: number,
    createdAtUtc: string,
    updatedAtUtc: string
  ): Promise<void> {
    const existing = this.marks.find((m) => m.user === user);
    if (existing) {
      existing.page = page;
      existing.updatedAtUtc = updatedAtUtc;
    } else {
      this.marks.push({ user, page, createdAtUtc, updatedAtUtc });
    }
  }

  async findMarkByUser(user: string): Promise<QuranMarkRow | null> {
    const found = this.marks.find((m) => m.user === user);
    return found ? { ...found } : null;
  }

  async listByUser(user: string, limit: number, offset: number): Promise<QuranHistoryRow[]> {
    return this.dailyReads
      .filter((r) => r.user === user)
      .sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc))
      .slice(offset, offset + limit)
      .map((r) => ({ pages: r.pages, createdAtUtc: r.createdAtUtc }));
  }

  async listDistinctUsers(): Promise<string[]> {
    return [...new Set(this.dailyReads.map((r) => r.user))];
  }

  async getReadDays(user: string, _tz: number, _range?: QuranStreakDateRange): Promise<string[]> {
    const days = [
      ...new Set(
        this.dailyReads.filter((r) => r.user === user).map((r) => r.createdAtUtc.slice(0, 10))
      ),
    ];
    return days.sort().reverse();
  }
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

describe('QuranService', () => {
  let repo: InMemoryQuranRepository;
  let userRepo: InMemoryUserRepository;
  let service: QuranService;

  const TZ = 420;
  const now = new Date('2026-04-08T10:00:00Z');
  const user = '628111111111';

  beforeEach(() => {
    repo = new InMemoryQuranRepository();
    userRepo = new InMemoryUserRepository();
    service = new QuranService(repo, userRepo, 10);
  });

  describe('logRead', () => {
    it('logs pages and returns result', async () => {
      const result = await service.logRead(user, TZ, 3, false, now);
      expect(result.pagesAdded).toBe(3);
      expect(result.totalToday).toBe(3);
      expect(result.noMark).toBe(false);
    });

    it('accumulates pages on the same day', async () => {
      await service.logRead(user, TZ, 3, false, now);
      const result = await service.logRead(user, TZ, 2, false, now);
      expect(result.totalToday).toBe(5);
    });

    it('auto-advances mark when mark exists', async () => {
      await repo.upsertMark(user, 100, now.toISOString(), now.toISOString());
      const result = await service.logRead(user, TZ, 5, false, now);
      expect(result.existingMarkPage).toBe(100);
      expect(result.newMarkPage).toBe(105);

      const mark = await repo.findMarkByUser(user);
      expect(mark?.page).toBe(105);
    });

    it('does not advance mark when noMark is true', async () => {
      await repo.upsertMark(user, 100, now.toISOString(), now.toISOString());
      const result = await service.logRead(user, TZ, 5, true, now);
      expect(result.noMark).toBe(true);
      expect(result.existingMarkPage).toBeNull();
      expect(result.newMarkPage).toBeNull();

      const mark = await repo.findMarkByUser(user);
      expect(mark?.page).toBe(100);
    });

    it('does not advance mark when no mark exists', async () => {
      const result = await service.logRead(user, TZ, 3, false, now);
      expect(result.existingMarkPage).toBeNull();
      expect(result.newMarkPage).toBeNull();
    });

    it('resets mark to 0 on khatam (exceeding page 604)', async () => {
      await repo.upsertMark(user, 600, now.toISOString(), now.toISOString());
      const result = await service.logRead(user, TZ, 10, false, now);
      expect(result.existingMarkPage).toBe(600);
      expect(result.newMarkPage).toBe(610); // signals overflow to presenter

      const mark = await repo.findMarkByUser(user);
      expect(mark?.page).toBe(0); // reset in DB
    });
  });

  describe('setMark', () => {
    it('sets mark for first time', async () => {
      const result = await service.setMark(user, 145, now);
      expect(result.existed).toBe(false);
      expect(result.previousPage).toBeNull();

      const mark = await repo.findMarkByUser(user);
      expect(mark?.page).toBe(145);
    });

    it('updates existing mark and returns previous page', async () => {
      await service.setMark(user, 100, now);
      const result = await service.setMark(user, 200, now);
      expect(result.existed).toBe(true);
      expect(result.previousPage).toBe(100);

      const mark = await repo.findMarkByUser(user);
      expect(mark?.page).toBe(200);
    });
  });

  describe('getMark', () => {
    it('returns null when no mark set', async () => {
      expect(await service.getMark(user)).toBeNull();
    });

    it('returns page when mark exists', async () => {
      await service.setMark(user, 250, now);
      expect(await service.getMark(user)).toBe(250);
    });
  });

  describe('listHistory', () => {
    it('returns empty result for new user', async () => {
      const result = await service.listHistory(user, 1, TZ, now);
      expect(result.totalDays).toBe(0);
      expect(result.totalPagesRead).toBe(0);
      expect(result.rows).toHaveLength(0);
    });

    it('returns history with streak info', async () => {
      await service.logRead(user, TZ, 5, true, now);
      const result = await service.listHistory(user, 1, TZ, now);
      expect(result.totalDays).toBe(1);
      expect(result.totalPagesRead).toBe(5);
      expect(result.rows).toHaveLength(1);
      expect(result.streaks.current).toBeGreaterThanOrEqual(0);
    });

    it('paginates correctly', async () => {
      for (let i = 0; i < 12; i++) {
        const day = new Date(`2026-04-${String(i + 1).padStart(2, '0')}T10:00:00Z`);
        await service.logRead(user, TZ, 2, true, day);
      }
      const page1 = await service.listHistory(user, 1, TZ, now);
      expect(page1.totalDays).toBe(12);
      expect(page1.totalPages).toBe(2);
      expect(page1.rows).toHaveLength(10);

      const page2 = await service.listHistory(user, 2, TZ, now);
      expect(page2.rows).toHaveLength(2);
    });

    it('returns empty rows for page beyond total', async () => {
      await service.logRead(user, TZ, 3, true, now);
      const result = await service.listHistory(user, 99, TZ, now);
      expect(result.rows).toHaveLength(0);
    });
  });
});

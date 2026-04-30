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
  dailyReads: (QuranDailyReadRow & { deletedAt: string | null; markBefore: number | null })[] = [];
  marks: QuranMarkRow[] = [];
  private nextId = 1;

  async addDailyReadPages(input: NewQuranReadLog): Promise<void> {
    this.dailyReads.push({
      id: this.nextId++,
      user: input.user,
      pages: input.pages,
      createdAtUtc: input.createdAtIsoUtc,
      updatedAtUtc: input.updatedAtUtc,
      deletedAt: null,
      markBefore: input.markBefore,
    });
  }

  async findTodayByUser(
    user: string,
    _tz: number,
    nowIsoUtc: string
  ): Promise<QuranDailyReadRow | null> {
    const dateKey = nowIsoUtc.slice(0, 10);
    const todayRows = this.dailyReads.filter(
      (r) => r.user === user && r.createdAtUtc.slice(0, 10) === dateKey && r.deletedAt === null
    );
    if (todayRows.length === 0) return null;
    const totalPages = todayRows.reduce((sum, r) => sum + r.pages, 0);
    return {
      id: 0,
      user,
      pages: totalPages,
      createdAtUtc: todayRows[0].createdAtUtc,
      updatedAtUtc: todayRows[todayRows.length - 1].updatedAtUtc,
      markBefore: null,
    };
  }

  async hasReadTodayByUser(user: string, _tz: number, nowIsoUtc: string): Promise<boolean> {
    const dateKey = nowIsoUtc.slice(0, 10);
    return this.dailyReads.some(
      (r) => r.user === user && r.createdAtUtc.slice(0, 10) === dateKey && r.deletedAt === null
    );
  }

  async countByUser(user: string): Promise<number> {
    const dates = new Set(
      this.dailyReads
        .filter((r) => r.user === user && r.deletedAt === null)
        .map((r) => r.createdAtUtc.slice(0, 10))
    );
    return dates.size;
  }

  async sumPagesByUser(user: string): Promise<number> {
    return this.dailyReads
      .filter((r) => r.user === user && r.deletedAt === null)
      .reduce((sum, r) => sum + r.pages, 0);
  }

  async sumPagesByUserInDateRange(
    user: string,
    _tz: number,
    start: string,
    end: string
  ): Promise<number> {
    return this.dailyReads
      .filter((r) => {
        if (r.user !== user || r.deletedAt !== null) return false;
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
    const grouped = new Map<string, number>();
    const firstCreated = new Map<string, string>();
    this.dailyReads
      .filter((r) => r.user === user && r.deletedAt === null)
      .forEach((r) => {
        const dateKey = r.createdAtUtc.slice(0, 10);
        grouped.set(dateKey, (grouped.get(dateKey) ?? 0) + r.pages);
        if (!firstCreated.has(dateKey)) firstCreated.set(dateKey, r.createdAtUtc);
      });
    return [...grouped.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(offset, offset + limit)
      .map(([dateKey, pages]) => ({ pages, createdAtUtc: firstCreated.get(dateKey)! }));
  }

  async listDistinctUsers(): Promise<string[]> {
    return [...new Set(this.dailyReads.filter((r) => r.deletedAt === null).map((r) => r.user))];
  }

  async getReadDays(user: string, _tz: number, _range?: QuranStreakDateRange): Promise<string[]> {
    const days = [
      ...new Set(
        this.dailyReads
          .filter((r) => r.user === user && r.deletedAt === null)
          .map((r) => r.createdAtUtc.slice(0, 10))
      ),
    ];
    return days.sort().reverse();
  }

  async findLastReadByUser(
    user: string,
    _tz: number,
    nowIsoUtc: string
  ): Promise<QuranDailyReadRow | null> {
    const dateKey = nowIsoUtc.slice(0, 10);
    const todayRows = this.dailyReads
      .filter(
        (r) => r.user === user && r.createdAtUtc.slice(0, 10) === dateKey && r.deletedAt === null
      )
      .sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
    return todayRows[0] ?? null;
  }

  async softDeleteById(id: number, deletedAtIso: string): Promise<void> {
    const row = this.dailyReads.find((r) => r.id === id && r.deletedAt === null);
    if (row) row.deletedAt = deletedAtIso;
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
  async getDisplayNamesByIds(ids: string[]): Promise<Map<string, string>> {
    return new Map(ids.map((id) => [id, id]));
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

  describe('undoTodayRead', () => {
    it('returns no_reads when user has no read today', async () => {
      const result = await service.undoTodayRead(user, TZ, now);
      expect(result.undone).toBe(false);
      if (!result.undone) expect(result.reason).toBe('no_reads');
    });

    it('undoes today read if within undo window', async () => {
      await service.logRead(user, TZ, 3, true, now);
      const undoNow = new Date(now.getTime() + 2 * 60 * 1000); // 2 min later
      const result = await service.undoTodayRead(user, TZ, undoNow);
      expect(result.undone).toBe(true);
      if (result.undone) expect(result.entry.pages).toBe(3);

      // row should now be soft-deleted
      const today = await repo.findTodayByUser(user, TZ, undoNow.toISOString());
      expect(today).toBeNull();
    });

    it('returns too_late when undo window has passed', async () => {
      await service.logRead(user, TZ, 3, true, now);
      const undoNow = new Date(now.getTime() + 6 * 60 * 1000); // 6 min later
      const result = await service.undoTodayRead(user, TZ, undoNow);
      expect(result.undone).toBe(false);
      if (!result.undone) expect(result.reason).toBe('too_late');
    });

    it('allows re-logging after undo', async () => {
      await service.logRead(user, TZ, 3, true, now);
      const undoNow = new Date(now.getTime() + 1 * 60 * 1000);
      await service.undoTodayRead(user, TZ, undoNow);

      const relogNow = new Date(now.getTime() + 2 * 60 * 1000);
      await service.logRead(user, TZ, 5, true, relogNow);

      const history = await service.listHistory(user, 1, TZ, relogNow);
      expect(history.totalDays).toBe(1);
      expect(history.totalPagesRead).toBe(5);
    });

    it('reverts mark when undoing a read that advanced it', async () => {
      await service.setMark(user, 100, now);
      await service.logRead(user, TZ, 5, false, now);
      const markAfterRead = await service.getMark(user);
      expect(markAfterRead).toBe(105);

      const undoNow = new Date(now.getTime() + 1 * 60 * 1000);
      const result = await service.undoTodayRead(user, TZ, undoNow);
      expect(result.undone).toBe(true);

      const markAfterUndo = await service.getMark(user);
      expect(markAfterUndo).toBe(100);
    });

    it('reverts mark to pre-overflow value when undoing a khatam-triggering read', async () => {
      await service.setMark(user, 600, now);
      await service.logRead(user, TZ, 10, false, now);
      const markAfterRead = await service.getMark(user);
      expect(markAfterRead).toBe(0);

      const undoNow = new Date(now.getTime() + 1 * 60 * 1000);
      await service.undoTodayRead(user, TZ, undoNow);

      const markAfterUndo = await service.getMark(user);
      expect(markAfterUndo).toBe(600);
    });

    it('does not touch mark when undoing a --no-mark read', async () => {
      await service.setMark(user, 100, now);
      await service.logRead(user, TZ, 5, true, now);
      expect(await service.getMark(user)).toBe(100);

      const undoNow = new Date(now.getTime() + 1 * 60 * 1000);
      await service.undoTodayRead(user, TZ, undoNow);

      expect(await service.getMark(user)).toBe(100);
    });

    it('undoes only the last read when multiple reads exist for today', async () => {
      await service.logRead(user, TZ, 3, true, now);
      const laterNow = new Date(now.getTime() + 1 * 60 * 1000);
      await service.logRead(user, TZ, 2, true, laterNow);

      const undoNow = new Date(now.getTime() + 2 * 60 * 1000);
      const result = await service.undoTodayRead(user, TZ, undoNow);
      expect(result.undone).toBe(true);
      if (result.undone) expect(result.entry.pages).toBe(2);

      const today = await repo.findTodayByUser(user, TZ, undoNow.toISOString());
      expect(today).not.toBeNull();
      expect(today!.pages).toBe(3);
    });

    it('can undo multiple reads sequentially if within window', async () => {
      await service.logRead(user, TZ, 3, true, now);
      const laterNow = new Date(now.getTime() + 1 * 60 * 1000);
      await service.logRead(user, TZ, 2, true, laterNow);

      const undo1 = new Date(now.getTime() + 2 * 60 * 1000);
      await service.undoTodayRead(user, TZ, undo1);

      const undo2 = new Date(now.getTime() + 3 * 60 * 1000);
      const result = await service.undoTodayRead(user, TZ, undo2);
      expect(result.undone).toBe(true);
      if (result.undone) expect(result.entry.pages).toBe(3);

      const today = await repo.findTodayByUser(user, TZ, undo2.toISOString());
      expect(today).toBeNull();
    });

    it('reverts mark correctly when undoing latest of multiple reads', async () => {
      await service.setMark(user, 100, now);
      await service.logRead(user, TZ, 5, false, now);
      const laterNow = new Date(now.getTime() + 1 * 60 * 1000);
      await service.logRead(user, TZ, 3, false, laterNow);

      const undoNow = new Date(now.getTime() + 2 * 60 * 1000);
      await service.undoTodayRead(user, TZ, undoNow);

      const mark = await service.getMark(user);
      expect(mark).toBe(105);

      const today = await repo.findTodayByUser(user, TZ, undoNow.toISOString());
      expect(today!.pages).toBe(5);
    });
  });
});

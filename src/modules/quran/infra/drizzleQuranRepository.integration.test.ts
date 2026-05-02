import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleQuranRepository } from './drizzleQuranRepository.js';
import { setupTestDb, cleanAllTables } from '../../../db/testHelper.js';
import type { DrizzleDb } from '../../../db/drizzle.js';

const TZ = 420; // UTC+7
const userA = 'quran-batch-user-a';
const userB = 'quran-batch-user-b';

describe('DrizzleQuranRepository batch methods', () => {
  let db: DrizzleDb;
  let close: () => Promise<void>;
  let repo: DrizzleQuranRepository;

  beforeAll(async () => {
    ({ db, close } = await setupTestDb());
    repo = new DrizzleQuranRepository(db);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await cleanAllTables(db);
  });

  const insertRead = (
    user: string,
    pages: number,
    createdAtUtc: string,
    markBefore: number | null = null
  ) =>
    repo.addDailyReadPages({
      user,
      pages,
      timezoneOffsetMinutes: TZ,
      nowIsoUtc: createdAtUtc,
      createdAtIsoUtc: createdAtUtc,
      updatedAtUtc: createdAtUtc,
      markBefore,
    });

  describe('getReadDaysForUsers', () => {
    it('returns empty map for empty userIds', async () => {
      const result = await repo.getReadDaysForUsers([], TZ);
      expect(result.size).toBe(0);
    });

    it('returns days keyed by user for multiple users', async () => {
      await insertRead(userA, 3, '2026-04-10T03:00:00.000Z');
      await insertRead(userA, 2, '2026-04-12T03:00:00.000Z');
      await insertRead(userB, 5, '2026-04-11T03:00:00.000Z');

      const result = await repo.getReadDaysForUsers([userA, userB], TZ);
      // ordered DESC inside each user's array
      expect(result.get(userA)).toEqual(['2026-04-12', '2026-04-10']);
      expect(result.get(userB)).toEqual(['2026-04-11']);
    });

    it('deduplicates rows on the same local day', async () => {
      // two separate inserts on the same local day → still one entry
      await insertRead(userA, 3, '2026-04-10T03:00:00.000Z');
      await insertRead(userA, 2, '2026-04-10T08:00:00.000Z');

      const result = await repo.getReadDaysForUsers([userA], TZ);
      expect(result.get(userA)).toEqual(['2026-04-10']);
    });

    it('applies optional date range filter', async () => {
      await insertRead(userA, 3, '2026-04-05T03:00:00.000Z'); // in range
      await insertRead(userA, 4, '2026-03-25T03:00:00.000Z'); // out of range

      const result = await repo.getReadDaysForUsers([userA], TZ, {
        startDateInclusive: '2026-04-01',
        endDateInclusive: '2026-04-30',
      });
      expect(result.get(userA)).toEqual(['2026-04-05']);
    });

    it('excludes pages = 0 rows', async () => {
      await insertRead(userA, 0, '2026-04-10T03:00:00.000Z');

      const result = await repo.getReadDaysForUsers([userA], TZ);
      expect(result.has(userA)).toBe(false);
    });

    it('excludes soft-deleted rows', async () => {
      await insertRead(userA, 3, '2026-04-10T03:00:00.000Z');
      const last = await repo.findLastReadByUser(userA, TZ, '2026-04-10T03:00:00.000Z');
      await repo.softDeleteById(last!.id, '2026-04-10T04:00:00.000Z');

      const result = await repo.getReadDaysForUsers([userA], TZ);
      expect(result.has(userA)).toBe(false);
    });

    it('users with no rows are absent from result', async () => {
      const result = await repo.getReadDaysForUsers([userA, 'never-existed'], TZ);
      expect(result.has('never-existed')).toBe(false);
    });
  });

  describe('sumPagesByUsersInDateRange', () => {
    it('returns empty map for empty userIds', async () => {
      const result = await repo.sumPagesByUsersInDateRange([], TZ, '2026-04-01', '2026-04-30');
      expect(result.size).toBe(0);
    });

    it('sums pages per user within the range', async () => {
      await insertRead(userA, 3, '2026-04-05T03:00:00.000Z');
      await insertRead(userA, 4, '2026-04-15T03:00:00.000Z');
      await insertRead(userB, 2, '2026-04-10T03:00:00.000Z');

      const result = await repo.sumPagesByUsersInDateRange(
        [userA, userB],
        TZ,
        '2026-04-01',
        '2026-04-30'
      );
      expect(result.get(userA)).toBe(7);
      expect(result.get(userB)).toBe(2);
    });

    it('excludes out-of-range rows', async () => {
      await insertRead(userA, 3, '2026-03-15T03:00:00.000Z'); // out of range
      await insertRead(userA, 4, '2026-04-15T03:00:00.000Z'); // in range

      const result = await repo.sumPagesByUsersInDateRange(
        [userA],
        TZ,
        '2026-04-01',
        '2026-04-30'
      );
      expect(result.get(userA)).toBe(4);
    });

    it('excludes soft-deleted rows', async () => {
      await insertRead(userA, 3, '2026-04-10T03:00:00.000Z');
      await insertRead(userA, 4, '2026-04-11T03:00:00.000Z');
      const last = await repo.findLastReadByUser(userA, TZ, '2026-04-11T03:00:00.000Z');
      await repo.softDeleteById(last!.id, '2026-04-11T04:00:00.000Z');

      const result = await repo.sumPagesByUsersInDateRange(
        [userA],
        TZ,
        '2026-04-01',
        '2026-04-30'
      );
      expect(result.get(userA)).toBe(3);
    });

    it('users with zero in-range pages are absent from the map', async () => {
      await insertRead(userA, 3, '2026-03-15T03:00:00.000Z'); // out of range
      await insertRead(userB, 2, '2026-04-15T03:00:00.000Z'); // in range

      const result = await repo.sumPagesByUsersInDateRange(
        [userA, userB],
        TZ,
        '2026-04-01',
        '2026-04-30'
      );
      expect(result.has(userA)).toBe(false);
      expect(result.get(userB)).toBe(2);
    });

    it('respects timezone boundary', async () => {
      // 2026-04-30T17:30:00Z → local 2026-05-01 00:30 → should NOT count in April
      await insertRead(userA, 3, '2026-04-30T17:30:00.000Z');

      const april = await repo.sumPagesByUsersInDateRange(
        [userA],
        TZ,
        '2026-04-01',
        '2026-04-30'
      );
      expect(april.has(userA)).toBe(false);

      const may = await repo.sumPagesByUsersInDateRange(
        [userA],
        TZ,
        '2026-05-01',
        '2026-05-31'
      );
      expect(may.get(userA)).toBe(3);
    });
  });
});

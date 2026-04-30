import { debug } from '../../logger.js';
import { computeQuranStreaks } from './quranStreaks.js';
import type { StreakInfo } from './quranStreaks.js';
import type {
  QuranRepository,
  QuranDailyReadRow,
  QuranHistoryRow,
  QuranStreakDateRange,
} from './infra/quranRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';

export type QuranLeaderboardMode = 'monthly' | 'ramadhan';

export type QuranLeaderboardEntry = {
  user: string;
  currentStreak: number;
  bestStreak: number;
  pagesRead: number;
};

export type ReadLogResult = {
  pagesAdded: number;
  totalToday: number;
  streaks: StreakInfo;
  noMark: boolean;
  existingMarkPage: number | null;
  newMarkPage: number | null;
};

export type QuranListResult = {
  rows: QuranHistoryRow[];
  totalDays: number;
  totalPagesRead: number;
  totalPages: number;
  page: number;
  streaks: StreakInfo;
  currentMarkPage: number | null;
  ramadhanPagesRead: number | null;
};

export const QURAN_UNDO_WINDOW_MS = 5 * 60 * 1000;

export type UndoReadResult =
  | { undone: true; entry: QuranDailyReadRow }
  | { undone: false; reason: 'no_reads' }
  | { undone: false; reason: 'too_late'; entry: QuranDailyReadRow };

const MAX_QURAN_PAGE = 604;

function isIsoDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

export function getDateRangeMode(
  ramadhanCountEnabled: boolean,
  ramadhanStartDate: string,
  ramadhanEndDate: string
): { mode: QuranLeaderboardMode; range?: QuranStreakDateRange } {
  const hasRamadhanRange = isIsoDateOnly(ramadhanStartDate) && isIsoDateOnly(ramadhanEndDate);
  const isValidRamadhanRange = hasRamadhanRange && ramadhanStartDate <= ramadhanEndDate;

  if (ramadhanCountEnabled && isValidRamadhanRange) {
    return {
      mode: 'ramadhan',
      range: {
        startDateInclusive: ramadhanStartDate,
        endDateInclusive: ramadhanEndDate,
      },
    };
  }

  return { mode: 'monthly' };
}

export function getCurrentMonthDateRange(
  now: Date,
  timezoneOffsetMinutes: number
): QuranStreakDateRange {
  const local = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    startDateInclusive: `${year}-${String(month).padStart(2, '0')}-01`,
    endDateInclusive: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function getLastMonthDateRange(
  now: Date,
  timezoneOffsetMinutes: number
): QuranStreakDateRange & { monthLabel: string } {
  const local = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;

  const lastMonthDate = new Date(Date.UTC(year, month - 2, 1));
  const lastYear = lastMonthDate.getUTCFullYear();
  const lastMonth = lastMonthDate.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(lastYear, lastMonth, 0)).getUTCDate();

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  return {
    startDateInclusive: `${lastYear}-${String(lastMonth).padStart(2, '0')}-01`,
    endDateInclusive: `${lastYear}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    monthLabel: `${monthNames[lastMonth - 1]} ${lastYear}`,
  };
}

export class QuranService {
  constructor(
    private readonly quranRepository: QuranRepository,
    private readonly userRepository: UserRepository,
    private readonly quranListLimit: number = 10,
    private readonly ramadhanCountEnabled: boolean = false,
    private readonly ramadhanStartDate: string = '',
    private readonly ramadhanEndDate: string = ''
  ) {}

  async logRead(
    sender: string,
    timezoneOffsetMinutes: number,
    pagesAdded: number,
    noMark: boolean,
    now: Date
  ): Promise<ReadLogResult> {
    const nowIsoUtc = now.toISOString();

    let existingMarkPage: number | null = null;
    let newMarkPage: number | null = null;
    let markBefore: number | null = null;

    if (!noMark) {
      const existingMark = await this.quranRepository.findMarkByUser(sender);

      if (existingMark) {
        existingMarkPage = existingMark.page;
        markBefore = existingMark.page;
        const computed = existingMark.page + pagesAdded;

        if (computed > MAX_QURAN_PAGE) {
          newMarkPage = computed; // signal overflow — presenter handles the display
          await this.quranRepository.upsertMark(sender, 0, existingMark.createdAtUtc, nowIsoUtc);
        } else {
          newMarkPage = computed;
          await this.quranRepository.upsertMark(
            sender,
            computed,
            existingMark.createdAtUtc,
            nowIsoUtc
          );
        }
      }
    }

    await this.quranRepository.addDailyReadPages({
      user: sender,
      pages: pagesAdded,
      timezoneOffsetMinutes,
      nowIsoUtc,
      createdAtIsoUtc: nowIsoUtc,
      updatedAtUtc: nowIsoUtc,
      markBefore,
    });

    const todayRecord = await this.quranRepository.findTodayByUser(
      sender,
      timezoneOffsetMinutes,
      nowIsoUtc
    );
    const totalToday = todayRecord?.pages ?? pagesAdded;

    const readDays = await this.quranRepository.getReadDays(sender, timezoneOffsetMinutes);
    const streaks = computeQuranStreaks(readDays, timezoneOffsetMinutes, now);

    debug(`📖 Quran read logged: +${pagesAdded} page(s) by ${sender} at ${nowIsoUtc}`);

    return { pagesAdded, totalToday, streaks, noMark, existingMarkPage, newMarkPage };
  }

  async setMark(
    sender: string,
    page: number,
    now: Date
  ): Promise<{ existed: boolean; previousPage: number | null }> {
    const nowIsoUtc = now.toISOString();
    const existing = await this.quranRepository.findMarkByUser(sender);

    await this.quranRepository.upsertMark(
      sender,
      page,
      existing?.createdAtUtc ?? nowIsoUtc,
      nowIsoUtc
    );

    return { existed: !!existing, previousPage: existing?.page ?? null };
  }

  async getMark(sender: string): Promise<number | null> {
    const mark = await this.quranRepository.findMarkByUser(sender);
    return mark?.page ?? null;
  }

  async listHistory(
    sender: string,
    page: number,
    timezoneOffsetMinutes: number,
    now: Date
  ): Promise<QuranListResult> {
    const offset = (page - 1) * this.quranListLimit;

    const [totalDays, totalPagesRead, currentMark] = await Promise.all([
      this.quranRepository.countByUser(sender),
      this.quranRepository.sumPagesByUser(sender),
      this.quranRepository.findMarkByUser(sender),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalDays / this.quranListLimit));

    const rows =
      totalDays === 0 || page > totalPages
        ? []
        : await this.quranRepository.listByUser(sender, this.quranListLimit, offset);

    const readDays = await this.quranRepository.getReadDays(sender, timezoneOffsetMinutes);
    const streaks = computeQuranStreaks(readDays, timezoneOffsetMinutes, now);

    let ramadhanPagesRead: number | null = null;
    const dateRangeMode = getDateRangeMode(
      this.ramadhanCountEnabled,
      this.ramadhanStartDate,
      this.ramadhanEndDate
    );
    if (dateRangeMode.mode === 'ramadhan' && dateRangeMode.range) {
      ramadhanPagesRead = await this.quranRepository.sumPagesByUserInDateRange(
        sender,
        timezoneOffsetMinutes,
        dateRangeMode.range.startDateInclusive,
        dateRangeMode.range.endDateInclusive
      );
    }

    return {
      rows,
      totalDays,
      totalPagesRead,
      totalPages,
      page,
      streaks,
      currentMarkPage: currentMark?.page ?? null,
      ramadhanPagesRead,
    };
  }

  async getLeaderboard(
    timezoneOffsetMinutes: number,
    now: Date
  ): Promise<{ mode: QuranLeaderboardMode; entries: QuranLeaderboardEntry[] }> {
    const dateRangeMode = getDateRangeMode(
      this.ramadhanCountEnabled,
      this.ramadhanStartDate,
      this.ramadhanEndDate
    );
    const pageRange =
      dateRangeMode.mode === 'ramadhan' && dateRangeMode.range
        ? dateRangeMode.range
        : getCurrentMonthDateRange(now, timezoneOffsetMinutes);

    const userIds = await this.quranRepository.listDistinctUsers();

    const rawEntries = await Promise.all(
      userIds.map(async (userId) => {
        const readDays = await this.quranRepository.getReadDays(
          userId,
          timezoneOffsetMinutes,
          dateRangeMode.mode === 'ramadhan' ? dateRangeMode.range : undefined
        );
        const streak = computeQuranStreaks(readDays, timezoneOffsetMinutes, now);
        const pagesRead = await this.quranRepository.sumPagesByUserInDateRange(
          userId,
          timezoneOffsetMinutes,
          pageRange.startDateInclusive,
          pageRange.endDateInclusive
        );
        return { userId, currentStreak: streak.current, bestStreak: streak.best, pagesRead };
      })
    );

    const filtered = rawEntries.filter(
      (e) => e.currentStreak > 0 || e.bestStreak > 0 || e.pagesRead > 0
    );
    const namesById = await this.userRepository.getDisplayNamesByIds(filtered.map((e) => e.userId));
    const entries: QuranLeaderboardEntry[] = filtered.map((e) => ({
      user: namesById.get(e.userId) ?? e.userId,
      currentStreak: e.currentStreak,
      bestStreak: e.bestStreak,
      pagesRead: e.pagesRead,
    }));

    debug(`📖 Quran leaderboard generated: mode=${dateRangeMode.mode}, entries=${entries.length}`);

    return { mode: dateRangeMode.mode, entries };
  }

  async getLastMonthLeaderboard(
    timezoneOffsetMinutes: number,
    now: Date
  ): Promise<{ entries: QuranLeaderboardEntry[]; monthLabel: string }> {
    const { startDateInclusive, endDateInclusive, monthLabel } = getLastMonthDateRange(
      now,
      timezoneOffsetMinutes
    );

    const userIds = await this.quranRepository.listDistinctUsers();

    const rawEntries = await Promise.all(
      userIds.map(async (userId) => {
        const readDays = await this.quranRepository.getReadDays(userId, timezoneOffsetMinutes);
        const streak = computeQuranStreaks(readDays, timezoneOffsetMinutes, now);
        const pagesRead = await this.quranRepository.sumPagesByUserInDateRange(
          userId,
          timezoneOffsetMinutes,
          startDateInclusive,
          endDateInclusive
        );
        return { userId, currentStreak: streak.current, bestStreak: streak.best, pagesRead };
      })
    );

    const filtered = rawEntries.filter((e) => e.pagesRead > 0);
    const namesById = await this.userRepository.getDisplayNamesByIds(filtered.map((e) => e.userId));
    const entries: QuranLeaderboardEntry[] = filtered.map((e) => ({
      user: namesById.get(e.userId) ?? e.userId,
      currentStreak: e.currentStreak,
      bestStreak: e.bestStreak,
      pagesRead: e.pagesRead,
    }));

    debug(
      `📖 Quran last-month leaderboard generated: monthLabel=${monthLabel}, entries=${entries.length}`
    );

    return { entries, monthLabel };
  }

  async getReminderDataForUser(
    userId: string,
    timezoneOffsetMinutes: number,
    now: Date
  ): Promise<{ hasRead: boolean; currentStreak: number; name: string }> {
    const [hasRead, readDays, name] = await Promise.all([
      this.quranRepository.hasReadTodayByUser(userId, timezoneOffsetMinutes, now.toISOString()),
      this.quranRepository.getReadDays(userId, timezoneOffsetMinutes),
      this.userRepository.getDisplayName(userId),
    ]);
    const streaks = computeQuranStreaks(readDays, timezoneOffsetMinutes, now);
    return { hasRead, currentStreak: streaks.current, name };
  }

  async undoTodayRead(
    sender: string,
    timezoneOffsetMinutes: number,
    now: Date
  ): Promise<UndoReadResult> {
    const nowIsoUtc = now.toISOString();
    const entry = await this.quranRepository.findLastReadByUser(
      sender,
      timezoneOffsetMinutes,
      nowIsoUtc
    );

    if (!entry) {
      return { undone: false, reason: 'no_reads' };
    }

    const elapsed = now.getTime() - new Date(entry.updatedAtUtc).getTime();
    if (elapsed > QURAN_UNDO_WINDOW_MS) {
      return { undone: false, reason: 'too_late', entry };
    }

    await this.quranRepository.softDeleteById(entry.id, nowIsoUtc);

    // Revert mark if this read had advanced it
    if (entry.markBefore !== null) {
      const currentMark = await this.quranRepository.findMarkByUser(sender);
      if (currentMark) {
        await this.quranRepository.upsertMark(
          sender,
          entry.markBefore,
          currentMark.createdAtUtc,
          nowIsoUtc
        );
      }
    }

    debug(`📖 Quran read undone: id=${entry.id}, user=${sender}, updatedAt=${entry.updatedAtUtc}`);

    return { undone: true, entry };
  }

  async listDistinctUsers(): Promise<string[]> {
    return this.quranRepository.listDistinctUsers();
  }
}

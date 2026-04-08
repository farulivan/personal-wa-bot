import { debug } from '../../logger.js';
import {
  QURAN_LIST_LIMIT,
  QURAN_RAMADHAN_COUNT_ENABLED,
  QURAN_RAMADHAN_START_DATE,
  QURAN_RAMADHAN_END_DATE,
} from '../../config/env.js';
import { computeQuranStreaks } from './quranStreaks.js';
import type { StreakInfo } from './quranStreaks.js';
import type {
  QuranRepository,
  QuranHistoryRow,
  QuranStreakDateRange,
} from './infra/quranRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import type { UserReminder } from './quranPresenter.js';
import {
  listGroupMemberIdentities,
  resolveNormalizedBotUserId,
  type BotInfoClientLike,
  type GroupMemberClientLike,
  type GroupMemberIdentity,
} from '../../adapters/whatsapp/waId.js';

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

export type ReminderClientLike = GroupMemberClientLike & BotInfoClientLike;

const MAX_QURAN_PAGE = 604;

function isIsoDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

export function getDateRangeMode(): { mode: QuranLeaderboardMode; range?: QuranStreakDateRange } {
  const hasRamadhanRange =
    isIsoDateOnly(QURAN_RAMADHAN_START_DATE) && isIsoDateOnly(QURAN_RAMADHAN_END_DATE);
  const isValidRamadhanRange =
    hasRamadhanRange && QURAN_RAMADHAN_START_DATE <= QURAN_RAMADHAN_END_DATE;

  if (QURAN_RAMADHAN_COUNT_ENABLED && isValidRamadhanRange) {
    return {
      mode: 'ramadhan',
      range: {
        startDateInclusive: QURAN_RAMADHAN_START_DATE,
        endDateInclusive: QURAN_RAMADHAN_END_DATE,
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

export class QuranService {
  constructor(
    private readonly quranRepository: QuranRepository,
    private readonly userRepository: UserRepository
  ) {}

  async logRead(
    sender: string,
    timezoneOffsetMinutes: number,
    pagesAdded: number,
    noMark: boolean,
    now: Date
  ): Promise<ReadLogResult> {
    const nowIsoUtc = now.toISOString();

    await this.quranRepository.addDailyReadPages({
      user: sender,
      pages: pagesAdded,
      timezoneOffsetMinutes,
      nowIsoUtc,
      createdAtIsoUtc: nowIsoUtc,
      updatedAtUtc: nowIsoUtc,
    });

    const todayRecord = await this.quranRepository.findTodayByUser(
      sender,
      timezoneOffsetMinutes,
      nowIsoUtc
    );
    const totalToday = todayRecord?.pages ?? pagesAdded;

    const readDays = await this.quranRepository.getReadDays(sender, timezoneOffsetMinutes);
    const streaks = computeQuranStreaks(readDays, timezoneOffsetMinutes, now);

    let existingMarkPage: number | null = null;
    let newMarkPage: number | null = null;

    if (!noMark) {
      const existingMark = await this.quranRepository.findMarkByUser(sender);

      if (existingMark) {
        existingMarkPage = existingMark.page;
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
    const offset = (page - 1) * QURAN_LIST_LIMIT;

    const [totalDays, totalPagesRead, currentMark] = await Promise.all([
      this.quranRepository.countByUser(sender),
      this.quranRepository.sumPagesByUser(sender),
      this.quranRepository.findMarkByUser(sender),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalDays / QURAN_LIST_LIMIT));

    const rows =
      totalDays === 0 || page > totalPages
        ? []
        : await this.quranRepository.listByUser(sender, QURAN_LIST_LIMIT, offset);

    const readDays = await this.quranRepository.getReadDays(sender, timezoneOffsetMinutes);
    const streaks = computeQuranStreaks(readDays, timezoneOffsetMinutes, now);

    let ramadhanPagesRead: number | null = null;
    const dateRangeMode = getDateRangeMode();
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
    const dateRangeMode = getDateRangeMode();
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

    const entries: QuranLeaderboardEntry[] = await Promise.all(
      filtered.map(async (e) => ({
        user: await this.userRepository.getDisplayName(e.userId),
        currentStreak: e.currentStreak,
        bestStreak: e.bestStreak,
        pagesRead: e.pagesRead,
      }))
    );

    debug(`📖 Quran leaderboard generated: mode=${dateRangeMode.mode}, entries=${entries.length}`);

    return { mode: dateRangeMode.mode, entries };
  }

  async getReminderTargets(
    client: ReminderClientLike,
    groupChatId: string,
    timezoneOffsetMinutes: number,
    now: Date
  ): Promise<UserReminder[]> {
    const [memberIdentities, botUserId, dbUsers] = await Promise.all([
      listGroupMemberIdentities(client, groupChatId),
      resolveNormalizedBotUserId(client),
      this.quranRepository.listDistinctUsers(),
    ]);

    const groupMemberIdentities: GroupMemberIdentity[] = botUserId
      ? memberIdentities.filter((member) => !member.aliases.includes(botUserId))
      : memberIdentities;

    const knownUsers = new Set(dbUsers);
    const targetUserIds = new Set<string>();

    for (const member of groupMemberIdentities) {
      const matchedDbId = member.aliases.find((alias: string) => knownUsers.has(alias));
      const dbUserId = matchedDbId ?? member.primaryId;
      targetUserIds.add(dbUserId);
    }

    const targets = Array.from(targetUserIds);

    debug(`📖 Found ${targets.length} reminder targets from group participants`);

    return Promise.all(
      targets.map(async (userId) => {
        const [hasRead, readDays, name] = await Promise.all([
          this.quranRepository.hasReadTodayByUser(userId, timezoneOffsetMinutes, now.toISOString()),
          this.quranRepository.getReadDays(userId, timezoneOffsetMinutes),
          this.userRepository.getDisplayName(userId),
        ]);
        const streaks = computeQuranStreaks(readDays, timezoneOffsetMinutes, now);
        return { name, hasRead, currentStreak: streaks.current };
      })
    );
  }
}

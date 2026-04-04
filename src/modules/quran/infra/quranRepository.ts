export type NewQuranReadLog = {
  user: string;
  pages: number;
  timezoneOffsetMinutes: number;
  nowIsoUtc: string;
  createdAtIsoUtc: string;
  updatedAtUtc: string;
};

export type QuranDailyReadRow = {
  user: string;
  pages: number;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type QuranHistoryRow = {
  pages: number;
  createdAtUtc: string;
};

export type QuranMarkRow = {
  user: string;
  page: number;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type QuranStreakDateRange = {
  startDateInclusive: string;
  endDateInclusive: string;
};

export interface QuranRepository {
  addDailyReadPages(input: NewQuranReadLog): Promise<void>;
  findTodayByUser(
    user: string,
    timezoneOffsetMinutes: number,
    nowIsoUtc: string
  ): Promise<QuranDailyReadRow | null>;
  hasReadTodayByUser(
    user: string,
    timezoneOffsetMinutes: number,
    nowIsoUtc: string
  ): Promise<boolean>;
  countByUser(user: string): Promise<number>;
  sumPagesByUser(user: string): Promise<number>;
  sumPagesByUserInDateRange(
    user: string,
    timezoneOffsetMinutes: number,
    startDateInclusive: string,
    endDateInclusive: string
  ): Promise<number>;
  upsertMark(user: string, page: number, createdAtUtc: string, updatedAtUtc: string): Promise<void>;
  findMarkByUser(user: string): Promise<QuranMarkRow | null>;
  listByUser(user: string, limit: number, offset: number): Promise<QuranHistoryRow[]>;
  listDistinctUsers(): Promise<string[]>;
  getReadDays(
    user: string,
    timezoneOffsetMinutes: number,
    range?: QuranStreakDateRange
  ): Promise<string[]>;
}

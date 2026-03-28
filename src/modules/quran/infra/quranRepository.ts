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

export interface QuranRepository {
  addDailyReadPages(input: NewQuranReadLog): void;
  findTodayByUser(
    user: string,
    timezoneOffsetMinutes: number,
    nowIsoUtc: string
  ): QuranDailyReadRow | null;
  hasReadTodayByUser(user: string, timezoneOffsetMinutes: number, nowIsoUtc: string): boolean;
  countByUser(user: string): number;
  sumPagesByUser(user: string): number;
  sumPagesByUserInDateRange(
    user: string,
    timezoneOffsetMinutes: number,
    startDateInclusive: string,
    endDateInclusive: string
  ): number;
  upsertMark(user: string, page: number, createdAtUtc: string, updatedAtUtc: string): void;
  findMarkByUser(user: string): QuranMarkRow | null;
  listByUser(user: string, limit: number, offset: number): QuranHistoryRow[];
  listDistinctUsers(): string[];
}

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

export interface QuranRepository {
  addDailyReadPages(input: NewQuranReadLog): void;
  findTodayByUser(
    user: string,
    timezoneOffsetMinutes: number,
    nowIsoUtc: string
  ): QuranDailyReadRow | null;
  hasReadTodayByUser(user: string, timezoneOffsetMinutes: number, nowIsoUtc: string): boolean;
  listDistinctUsers(): string[];
}

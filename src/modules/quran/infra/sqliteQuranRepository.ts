import type { Database } from 'better-sqlite3';
import type {
  NewQuranReadLog,
  QuranDailyReadRow,
  QuranHistoryRow,
  QuranRepository,
} from './quranRepository.js';

export class SqliteQuranRepository implements QuranRepository {
  constructor(private readonly db: Database) {}

  addDailyReadPages(input: NewQuranReadLog): void {
    const offsetSeconds = input.timezoneOffsetMinutes * 60;

    const tx = this.db.transaction((payload: NewQuranReadLog) => {
      const updateResult = this.db
        .prepare(
          `UPDATE quran_daily_reads
           SET pages = pages + ?,
               updated_at = ?
           WHERE user = ?
             AND date(created_at, '+${offsetSeconds} seconds') = date(?, '+${offsetSeconds} seconds')`
        )
        .run(payload.pages, payload.updatedAtUtc, payload.user, payload.nowIsoUtc);

      if (updateResult.changes > 0) {
        return;
      }

      this.db
        .prepare(
          `INSERT INTO quran_daily_reads (user, pages, created_at, updated_at)
           VALUES (?, ?, ?, ?)`
        )
        .run(payload.user, payload.pages, payload.createdAtIsoUtc, payload.updatedAtUtc);
    });

    tx(input);
  }

  findTodayByUser(
    user: string,
    timezoneOffsetMinutes: number,
    nowIsoUtc: string
  ): QuranDailyReadRow | null {
    const offsetSeconds = timezoneOffsetMinutes * 60;

    const row = this.db
      .prepare(
        `SELECT
          user,
          pages,
          created_at AS createdAtUtc,
          updated_at AS updatedAtUtc
        FROM quran_daily_reads
        WHERE user = ?
          AND date(created_at, '+${offsetSeconds} seconds') = date(?, '+${offsetSeconds} seconds')
        LIMIT 1`
      )
      .get(user, nowIsoUtc) as QuranDailyReadRow | undefined;

    return row ?? null;
  }

  hasReadTodayByUser(user: string, timezoneOffsetMinutes: number, nowIsoUtc: string): boolean {
    const offsetSeconds = timezoneOffsetMinutes * 60;

    const row = this.db
      .prepare(
        `SELECT 1
         FROM quran_daily_reads
         WHERE user = ?
           AND date(created_at, '+${offsetSeconds} seconds') = date(?, '+${offsetSeconds} seconds')
           AND pages > 0
         LIMIT 1`
      )
      .get(user, nowIsoUtc);

    return Boolean(row);
  }

  countByUser(user: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS total FROM quran_daily_reads WHERE user = ?`)
      .get(user) as { total: number };

    return row.total;
  }

  sumPagesByUser(user: string): number {
    const row = this.db
      .prepare(`SELECT COALESCE(SUM(pages), 0) AS totalPages FROM quran_daily_reads WHERE user = ?`)
      .get(user) as { totalPages: number };

    return row.totalPages;
  }

  listByUser(user: string, limit: number, offset: number): QuranHistoryRow[] {
    return this.db
      .prepare(
        `SELECT
          pages,
          created_at AS createdAtUtc
        FROM quran_daily_reads
        WHERE user = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`
      )
      .all(user, limit, offset) as QuranHistoryRow[];
  }

  listDistinctUsers(): string[] {
    const rows = this.db.prepare(`SELECT DISTINCT user FROM quran_daily_reads`).all() as {
      user: string;
    }[];

    return rows.map((row) => row.user);
  }
}

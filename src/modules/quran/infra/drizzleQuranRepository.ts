import { eq, sql, count, sum } from 'drizzle-orm';
import type { DrizzleDb } from '../../../db/drizzle.js';
import { quranDailyReads, quranMarks } from '../../../db/schema.js';
import type {
  QuranRepository,
  QuranDailyReadRow,
  QuranHistoryRow,
  QuranMarkRow,
  NewQuranReadLog,
  QuranStreakDateRange,
} from './quranRepository.js';

export class DrizzleQuranRepository implements QuranRepository {
  constructor(private readonly db: DrizzleDb) {}

  async addDailyReadPages(input: NewQuranReadLog): Promise<void> {
    const offsetSeconds = input.timezoneOffsetMinutes * 60;

    // Try update first (same user, same local date)
    const updateResult = await this.db
      .update(quranDailyReads)
      .set({
        pages: sql`${quranDailyReads.pages} + ${input.pages}`,
        updatedAt: input.updatedAtUtc,
      })
      .where(
        sql`${quranDailyReads.user} = ${input.user}
          AND DATE(${quranDailyReads.createdAt}::timestamp + INTERVAL '${sql.raw(String(offsetSeconds))} seconds')
            = DATE(${input.nowIsoUtc}::timestamp + INTERVAL '${sql.raw(String(offsetSeconds))} seconds')`
      );

    if ((updateResult as unknown as { rowCount: number }).rowCount > 0) {
      return;
    }

    // Insert new row
    await this.db.insert(quranDailyReads).values({
      user: input.user,
      pages: input.pages,
      createdAt: input.createdAtIsoUtc,
      updatedAt: input.updatedAtUtc,
    });
  }

  async findTodayByUser(
    user: string,
    timezoneOffsetMinutes: number,
    nowIsoUtc: string
  ): Promise<QuranDailyReadRow | null> {
    const offsetSeconds = timezoneOffsetMinutes * 60;

    const rows = await this.db
      .select({
        user: quranDailyReads.user,
        pages: quranDailyReads.pages,
        createdAtUtc: quranDailyReads.createdAt,
        updatedAtUtc: quranDailyReads.updatedAt,
      })
      .from(quranDailyReads)
      .where(
        sql`${quranDailyReads.user} = ${user}
          AND DATE(${quranDailyReads.createdAt}::timestamp + INTERVAL '${sql.raw(String(offsetSeconds))} seconds')
            = DATE(${nowIsoUtc}::timestamp + INTERVAL '${sql.raw(String(offsetSeconds))} seconds')`
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async hasReadTodayByUser(
    user: string,
    timezoneOffsetMinutes: number,
    nowIsoUtc: string
  ): Promise<boolean> {
    const offsetSeconds = timezoneOffsetMinutes * 60;

    const rows = await this.db
      .select({ one: sql`1` })
      .from(quranDailyReads)
      .where(
        sql`${quranDailyReads.user} = ${user}
          AND DATE(${quranDailyReads.createdAt}::timestamp + INTERVAL '${sql.raw(String(offsetSeconds))} seconds')
            = DATE(${nowIsoUtc}::timestamp + INTERVAL '${sql.raw(String(offsetSeconds))} seconds')
          AND ${quranDailyReads.pages} > 0`
      )
      .limit(1);

    return rows.length > 0;
  }

  async countByUser(user: string): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(quranDailyReads)
      .where(eq(quranDailyReads.user, user));

    return rows[0]?.total ?? 0;
  }

  async sumPagesByUser(user: string): Promise<number> {
    const rows = await this.db
      .select({ total: sum(quranDailyReads.pages) })
      .from(quranDailyReads)
      .where(eq(quranDailyReads.user, user));

    return Number(rows[0]?.total ?? 0);
  }

  async sumPagesByUserInDateRange(
    user: string,
    timezoneOffsetMinutes: number,
    startDateInclusive: string,
    endDateInclusive: string
  ): Promise<number> {
    const offsetSeconds = timezoneOffsetMinutes * 60;

    const rows = await this.db
      .select({ total: sum(quranDailyReads.pages) })
      .from(quranDailyReads)
      .where(
        sql`${quranDailyReads.user} = ${user}
          AND DATE(${quranDailyReads.createdAt}::timestamp + INTERVAL '${sql.raw(String(offsetSeconds))} seconds') >= DATE(${startDateInclusive}::timestamp)
          AND DATE(${quranDailyReads.createdAt}::timestamp + INTERVAL '${sql.raw(String(offsetSeconds))} seconds') <= DATE(${endDateInclusive}::timestamp)`
      );

    return Number(rows[0]?.total ?? 0);
  }

  async upsertMark(
    user: string,
    page: number,
    createdAtUtc: string,
    updatedAtUtc: string
  ): Promise<void> {
    await this.db
      .insert(quranMarks)
      .values({ user, page, createdAt: createdAtUtc, updatedAt: updatedAtUtc })
      .onConflictDoUpdate({
        target: quranMarks.user,
        set: { page, updatedAt: updatedAtUtc },
      });
  }

  async findMarkByUser(user: string): Promise<QuranMarkRow | null> {
    const rows = await this.db
      .select({
        user: quranMarks.user,
        page: quranMarks.page,
        createdAtUtc: quranMarks.createdAt,
        updatedAtUtc: quranMarks.updatedAt,
      })
      .from(quranMarks)
      .where(eq(quranMarks.user, user))
      .limit(1);

    return rows[0] ?? null;
  }

  async listByUser(user: string, limit: number, offset: number): Promise<QuranHistoryRow[]> {
    const rows = await this.db
      .select({
        pages: quranDailyReads.pages,
        createdAtUtc: quranDailyReads.createdAt,
      })
      .from(quranDailyReads)
      .where(eq(quranDailyReads.user, user))
      .orderBy(sql`${quranDailyReads.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    return rows;
  }

  async listDistinctUsers(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ user: quranDailyReads.user }).from(quranDailyReads);

    return rows.map((r) => r.user);
  }

  async getReadDays(
    user: string,
    timezoneOffsetMinutes: number,
    range?: QuranStreakDateRange
  ): Promise<string[]> {
    const offsetSeconds = timezoneOffsetMinutes * 60;
    const dayExpr = sql`DATE(${quranDailyReads.createdAt}::timestamp + INTERVAL '${sql.raw(String(offsetSeconds))} seconds')`;

    let query = sql`SELECT ${dayExpr} AS "localDate"
      FROM ${quranDailyReads}
      WHERE ${quranDailyReads.user} = ${user} AND ${quranDailyReads.pages} > 0`;

    if (range) {
      query = sql`${query}
        AND ${dayExpr} >= DATE(${range.startDateInclusive}::timestamp)
        AND ${dayExpr} <= DATE(${range.endDateInclusive}::timestamp)`;
    }

    query = sql`${query}
      GROUP BY "localDate"
      ORDER BY "localDate" DESC`;

    const rows = await this.db.execute(query);
    return (rows as unknown as Array<{ localDate: string }>).map((r) => r.localDate);
  }
}

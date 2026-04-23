import { eq, sql, sum, isNull, and } from 'drizzle-orm';
import type { DrizzleDb } from '../../../db/drizzle.js';
import { quranDailyReads, quranMarks } from './schema.js';
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
    await this.db.insert(quranDailyReads).values({
      user: input.user,
      pages: input.pages,
      createdAt: input.createdAtIsoUtc,
      updatedAt: input.updatedAtUtc,
      markBefore: input.markBefore,
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
        totalPages: sum(quranDailyReads.pages),
        minCreatedAt: sql<string>`MIN(${quranDailyReads.createdAt})`,
        maxUpdatedAt: sql<string>`MAX(${quranDailyReads.updatedAt})`,
      })
      .from(quranDailyReads)
      .where(
        sql`${quranDailyReads.user} = ${user}
          AND DATE(${quranDailyReads.createdAt}::timestamp + (INTERVAL '1 second' * ${offsetSeconds}))
            = DATE(${nowIsoUtc}::timestamp + (INTERVAL '1 second' * ${offsetSeconds}))
          AND ${quranDailyReads.deletedAt} IS NULL`
      );

    const total = Number(rows[0]?.totalPages ?? 0);
    if (total === 0) return null;

    return {
      id: 0,
      user,
      pages: total,
      createdAtUtc: rows[0].minCreatedAt,
      updatedAtUtc: rows[0].maxUpdatedAt,
      markBefore: null,
    };
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
          AND DATE(${quranDailyReads.createdAt}::timestamp + (INTERVAL '1 second' * ${offsetSeconds}))
            = DATE(${nowIsoUtc}::timestamp + (INTERVAL '1 second' * ${offsetSeconds}))
          AND ${quranDailyReads.pages} > 0
          AND ${quranDailyReads.deletedAt} IS NULL`
      )
      .limit(1);

    return rows.length > 0;
  }

  async countByUser(user: string): Promise<number> {
    const rows = await this.db
      .select({ total: sql<number>`COUNT(DISTINCT ${quranDailyReads.createdAt}::date)` })
      .from(quranDailyReads)
      .where(and(eq(quranDailyReads.user, user), isNull(quranDailyReads.deletedAt)));

    return Number(rows[0]?.total ?? 0);
  }

  async sumPagesByUser(user: string): Promise<number> {
    const rows = await this.db
      .select({ total: sum(quranDailyReads.pages) })
      .from(quranDailyReads)
      .where(and(eq(quranDailyReads.user, user), isNull(quranDailyReads.deletedAt)));

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
          AND DATE(${quranDailyReads.createdAt}::timestamp + (INTERVAL '1 second' * ${offsetSeconds})) >= DATE(${startDateInclusive}::timestamp)
          AND DATE(${quranDailyReads.createdAt}::timestamp + (INTERVAL '1 second' * ${offsetSeconds})) <= DATE(${endDateInclusive}::timestamp)
          AND ${quranDailyReads.deletedAt} IS NULL`
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
        pages: sql<number>`SUM(${quranDailyReads.pages})::int`,
        createdAtUtc: sql<string>`MIN(${quranDailyReads.createdAt})`,
      })
      .from(quranDailyReads)
      .where(and(eq(quranDailyReads.user, user), isNull(quranDailyReads.deletedAt)))
      .groupBy(sql`${quranDailyReads.createdAt}::date`)
      .orderBy(sql`MIN(${quranDailyReads.createdAt}) DESC`)
      .limit(limit)
      .offset(offset);

    return rows.map((r) => ({ pages: Number(r.pages), createdAtUtc: r.createdAtUtc }));
  }

  async listDistinctUsers(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ user: quranDailyReads.user })
      .from(quranDailyReads)
      .where(isNull(quranDailyReads.deletedAt));

    return rows.map((r) => r.user);
  }

  async getReadDays(
    user: string,
    timezoneOffsetMinutes: number,
    range?: QuranStreakDateRange
  ): Promise<string[]> {
    const offsetSeconds = timezoneOffsetMinutes * 60;
    const dayExpr = sql`DATE(${quranDailyReads.createdAt}::timestamp + (INTERVAL '1 second' * ${offsetSeconds}))`;

    let query = sql`SELECT ${dayExpr} AS "localDate"
      FROM ${quranDailyReads}
      WHERE ${quranDailyReads.user} = ${user} AND ${quranDailyReads.pages} > 0 AND ${quranDailyReads.deletedAt} IS NULL`;

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

  async findLastReadByUser(
    user: string,
    timezoneOffsetMinutes: number,
    nowIsoUtc: string
  ): Promise<QuranDailyReadRow | null> {
    const offsetSeconds = timezoneOffsetMinutes * 60;

    const rows = await this.db
      .select({
        id: quranDailyReads.id,
        user: quranDailyReads.user,
        pages: quranDailyReads.pages,
        createdAtUtc: quranDailyReads.createdAt,
        updatedAtUtc: quranDailyReads.updatedAt,
        markBefore: quranDailyReads.markBefore,
      })
      .from(quranDailyReads)
      .where(
        sql`${quranDailyReads.user} = ${user}
          AND DATE(${quranDailyReads.createdAt}::timestamp + (INTERVAL '1 second' * ${offsetSeconds}))
            = DATE(${nowIsoUtc}::timestamp + (INTERVAL '1 second' * ${offsetSeconds}))
          AND ${quranDailyReads.deletedAt} IS NULL`
      )
      .orderBy(sql`${quranDailyReads.createdAt} DESC`)
      .limit(1);

    return rows[0] ?? null;
  }

  async softDeleteById(id: number, deletedAtIso: string): Promise<void> {
    await this.db
      .update(quranDailyReads)
      .set({ deletedAt: deletedAtIso })
      .where(and(eq(quranDailyReads.id, id), isNull(quranDailyReads.deletedAt)));
  }
}

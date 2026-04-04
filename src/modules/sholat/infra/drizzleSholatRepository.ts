import { eq, sql, count, and } from 'drizzle-orm';
import type { DrizzleDb } from '../../../db/drizzle.js';
import { sholatLocations, sholatDailyCache } from '../../../db/schema.js';
import type {
  SholatRepository,
  SholatLocationRow,
  SholatDailyScheduleRow,
  NewSholatLocation,
  NewSholatDailySchedule,
} from './sholatRepository.js';

export class DrizzleSholatRepository implements SholatRepository {
  constructor(private readonly db: DrizzleDb) {}

  async countLocations(): Promise<number> {
    const rows = await this.db.select({ total: count() }).from(sholatLocations);

    return rows[0]?.total ?? 0;
  }

  async upsertLocations(rows: NewSholatLocation[]): Promise<void> {
    if (rows.length === 0) return;

    for (const row of rows) {
      await this.db
        .insert(sholatLocations)
        .values({
          id: row.id,
          locationName: row.locationName,
          normalizedLocationName: row.normalizedLocationName,
          fetchedAtUtc: row.fetchedAtUtc,
        })
        .onConflictDoUpdate({
          target: sholatLocations.id,
          set: {
            locationName: row.locationName,
            normalizedLocationName: row.normalizedLocationName,
            fetchedAtUtc: row.fetchedAtUtc,
          },
        });
    }
  }

  async listLocations(): Promise<SholatLocationRow[]> {
    const rows = await this.db
      .select({
        id: sholatLocations.id,
        locationName: sholatLocations.locationName,
        normalizedLocationName: sholatLocations.normalizedLocationName,
      })
      .from(sholatLocations)
      .orderBy(sql`${sholatLocations.locationName} ASC`);

    return rows;
  }

  async findDailySchedule(
    locationId: string,
    scheduleDate: string,
    timezone: string
  ): Promise<SholatDailyScheduleRow | null> {
    const rows = await this.db
      .select({
        locationId: sholatDailyCache.locationId,
        scheduleDate: sholatDailyCache.scheduleDate,
        timezone: sholatDailyCache.timezone,
        displayDate: sholatDailyCache.displayDate,
        imsak: sholatDailyCache.imsak,
        subuh: sholatDailyCache.subuh,
        terbit: sholatDailyCache.terbit,
        dhuha: sholatDailyCache.dhuha,
        dzuhur: sholatDailyCache.dzuhur,
        ashar: sholatDailyCache.ashar,
        maghrib: sholatDailyCache.maghrib,
        isya: sholatDailyCache.isya,
      })
      .from(sholatDailyCache)
      .where(
        and(
          eq(sholatDailyCache.locationId, locationId),
          eq(sholatDailyCache.scheduleDate, scheduleDate),
          eq(sholatDailyCache.timezone, timezone)
        )
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async upsertDailySchedule(row: NewSholatDailySchedule): Promise<void> {
    await this.db
      .insert(sholatDailyCache)
      .values({
        locationId: row.locationId,
        scheduleDate: row.scheduleDate,
        timezone: row.timezone,
        displayDate: row.displayDate,
        imsak: row.imsak,
        subuh: row.subuh,
        terbit: row.terbit,
        dhuha: row.dhuha,
        dzuhur: row.dzuhur,
        ashar: row.ashar,
        maghrib: row.maghrib,
        isya: row.isya,
        fetchedAtUtc: row.fetchedAtUtc,
      })
      .onConflictDoUpdate({
        target: [
          sholatDailyCache.locationId,
          sholatDailyCache.scheduleDate,
          sholatDailyCache.timezone,
        ],
        set: {
          displayDate: row.displayDate,
          imsak: row.imsak,
          subuh: row.subuh,
          terbit: row.terbit,
          dhuha: row.dhuha,
          dzuhur: row.dzuhur,
          ashar: row.ashar,
          maghrib: row.maghrib,
          isya: row.isya,
          fetchedAtUtc: row.fetchedAtUtc,
        },
      });
  }
}

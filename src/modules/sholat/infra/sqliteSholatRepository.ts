import type { Database } from 'better-sqlite3';
import type {
  NewSholatDailySchedule,
  NewSholatLocation,
  SholatDailyScheduleRow,
  SholatLocationRow,
  SholatRepository,
} from './sholatRepository.js';

export class SqliteSholatRepository implements SholatRepository {
  constructor(private readonly db: Database) {}

  countLocations(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS total FROM sholat_locations`).get() as {
      total: number;
    };

    return row.total;
  }

  upsertLocations(rows: NewSholatLocation[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO sholat_locations (id, location_name, normalized_location_name, fetched_at_utc)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         location_name = excluded.location_name,
         normalized_location_name = excluded.normalized_location_name,
         fetched_at_utc = excluded.fetched_at_utc`
    );

    const tx = this.db.transaction((input: NewSholatLocation[]) => {
      for (const row of input) {
        stmt.run(row.id, row.locationName, row.normalizedLocationName, row.fetchedAtUtc);
      }
    });

    tx(rows);
  }

  listLocations(): SholatLocationRow[] {
    return this.db
      .prepare(
        `SELECT
          id,
          location_name AS locationName,
          normalized_location_name AS normalizedLocationName
        FROM sholat_locations
        ORDER BY location_name ASC`
      )
      .all() as SholatLocationRow[];
  }

  findDailySchedule(
    locationId: string,
    scheduleDate: string,
    timezone: string
  ): SholatDailyScheduleRow | null {
    const row = this.db
      .prepare(
        `SELECT
          location_id AS locationId,
          schedule_date AS scheduleDate,
          timezone,
          display_date AS displayDate,
          imsak,
          subuh,
          terbit,
          dhuha,
          dzuhur,
          ashar,
          maghrib,
          isya
        FROM sholat_daily_cache
        WHERE location_id = ? AND schedule_date = ? AND timezone = ?`
      )
      .get(locationId, scheduleDate, timezone) as SholatDailyScheduleRow | undefined;

    return row ?? null;
  }

  upsertDailySchedule(row: NewSholatDailySchedule): void {
    this.db
      .prepare(
        `INSERT INTO sholat_daily_cache (
          location_id,
          schedule_date,
          timezone,
          display_date,
          imsak,
          subuh,
          terbit,
          dhuha,
          dzuhur,
          ashar,
          maghrib,
          isya,
          fetched_at_utc
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(location_id, schedule_date, timezone) DO UPDATE SET
          display_date = excluded.display_date,
          imsak = excluded.imsak,
          subuh = excluded.subuh,
          terbit = excluded.terbit,
          dhuha = excluded.dhuha,
          dzuhur = excluded.dzuhur,
          ashar = excluded.ashar,
          maghrib = excluded.maghrib,
          isya = excluded.isya,
          fetched_at_utc = excluded.fetched_at_utc`
      )
      .run(
        row.locationId,
        row.scheduleDate,
        row.timezone,
        row.displayDate,
        row.imsak,
        row.subuh,
        row.terbit,
        row.dhuha,
        row.dzuhur,
        row.ashar,
        row.maghrib,
        row.isya,
        row.fetchedAtUtc
      );
  }
}

import type Database from 'better-sqlite3';

type TableInfoRow = {
  name: string;
};

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
    .get(tableName);

  return Boolean(row);
}

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as TableInfoRow[];
  return rows.some((row) => row.name === columnName);
}

function migrateLegacySholatColumns(db: Database.Database): void {
  const migrate = db.transaction(() => {
    if (tableExists(db, 'sholat_locations')) {
      if (
        hasColumn(db, 'sholat_locations', 'lokasi') &&
        !hasColumn(db, 'sholat_locations', 'location_name')
      ) {
        db.exec(`ALTER TABLE sholat_locations RENAME COLUMN lokasi TO location_name`);
      }

      if (
        hasColumn(db, 'sholat_locations', 'normalized_lokasi') &&
        !hasColumn(db, 'sholat_locations', 'normalized_location_name')
      ) {
        db.exec(
          `ALTER TABLE sholat_locations RENAME COLUMN normalized_lokasi TO normalized_location_name`
        );
      }

      if (
        hasColumn(db, 'sholat_locations', 'fetched_at') &&
        !hasColumn(db, 'sholat_locations', 'fetched_at_utc')
      ) {
        db.exec(`ALTER TABLE sholat_locations RENAME COLUMN fetched_at TO fetched_at_utc`);
      }
    }

    if (tableExists(db, 'sholat_daily_cache')) {
      if (
        hasColumn(db, 'sholat_daily_cache', 'tanggal') &&
        !hasColumn(db, 'sholat_daily_cache', 'display_date')
      ) {
        db.exec(`ALTER TABLE sholat_daily_cache RENAME COLUMN tanggal TO display_date`);
      }

      if (
        hasColumn(db, 'sholat_daily_cache', 'fetched_at') &&
        !hasColumn(db, 'sholat_daily_cache', 'fetched_at_utc')
      ) {
        db.exec(`ALTER TABLE sholat_daily_cache RENAME COLUMN fetched_at TO fetched_at_utc`);
      }
    }
  });

  migrate();
}

export function registerSholatSchema(db: Database.Database): void {
  migrateLegacySholatColumns(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sholat_locations (
      id TEXT PRIMARY KEY,
      location_name TEXT NOT NULL,
      normalized_location_name TEXT NOT NULL,
      fetched_at_utc TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sholat_locations_normalized
      ON sholat_locations(normalized_location_name);

    CREATE TABLE IF NOT EXISTS sholat_daily_cache (
      location_id TEXT NOT NULL,
      schedule_date TEXT NOT NULL,
      timezone TEXT NOT NULL,
      display_date TEXT NOT NULL,
      imsak TEXT NOT NULL,
      subuh TEXT NOT NULL,
      terbit TEXT NOT NULL,
      dhuha TEXT NOT NULL,
      dzuhur TEXT NOT NULL,
      ashar TEXT NOT NULL,
      maghrib TEXT NOT NULL,
      isya TEXT NOT NULL,
      fetched_at_utc TEXT NOT NULL,
      PRIMARY KEY (location_id, schedule_date, timezone),
      FOREIGN KEY (location_id) REFERENCES sholat_locations(id) ON UPDATE CASCADE ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sholat_daily_cache_date_tz
      ON sholat_daily_cache(schedule_date, timezone);
  `);
}

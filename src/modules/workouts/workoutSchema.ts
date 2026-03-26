import type Database from 'better-sqlite3';

type TableInfoRow = {
  name: string;
};

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as TableInfoRow[];
  return rows.some((row) => row.name === columnName);
}

function normalizeExistingUserIds(db: Database.Database): void {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='workouts'`)
    .get();

  if (!tableExists) {
    return;
  }

  db.exec(`
    UPDATE workouts
    SET user = REPLACE(REPLACE(REPLACE(user, '@c.us', ''), '@lid', ''), '@g.us', '')
    WHERE user LIKE '%@c.us' OR user LIKE '%@lid' OR user LIKE '%@g.us'
  `);
}

function migrateWorkoutColumns(db: Database.Database): void {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='workouts'`)
    .get();

  if (!tableExists) {
    return;
  }

  const migrate = db.transaction(() => {
    if (!hasColumn(db, 'workouts', 'workout_mode')) {
      db.exec(`ALTER TABLE workouts ADD COLUMN workout_mode TEXT NOT NULL DEFAULT 'lift'`);
    }

    if (!hasColumn(db, 'workouts', 'duration_minutes')) {
      db.exec(`ALTER TABLE workouts ADD COLUMN duration_minutes REAL NOT NULL DEFAULT 0`);
    }

    if (!hasColumn(db, 'workouts', 'distance_km')) {
      db.exec(`ALTER TABLE workouts ADD COLUMN distance_km REAL NOT NULL DEFAULT 0`);
    }

    db.exec(`
      UPDATE workouts
      SET workout_mode = 'lift'
      WHERE workout_mode IS NULL OR TRIM(workout_mode) = ''
    `);
  });

  migrate();
}

export function registerWorkoutSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT NOT NULL,
      type TEXT NOT NULL,
      reps INTEGER NOT NULL,
      sets INTEGER NOT NULL,
      weight INTEGER NOT NULL DEFAULT 0,
      workout_mode TEXT NOT NULL DEFAULT 'lift',
      duration_minutes REAL NOT NULL DEFAULT 0,
      distance_km REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  migrateWorkoutColumns(db);
  normalizeExistingUserIds(db);
}

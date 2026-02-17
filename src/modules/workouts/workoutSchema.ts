import type Database from 'better-sqlite3';

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

export function registerWorkoutSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT NOT NULL,
      type TEXT NOT NULL,
      reps INTEGER NOT NULL,
      sets INTEGER NOT NULL,
      weight INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  normalizeExistingUserIds(db);
}

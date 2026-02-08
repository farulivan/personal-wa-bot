import type Database from 'better-sqlite3';

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
}

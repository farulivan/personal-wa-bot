import type Database from 'better-sqlite3';

export function registerUserProfileSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      sender TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

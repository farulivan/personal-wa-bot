import type Database from 'better-sqlite3';

export function registerUserSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone_number TEXT,
      contact_name TEXT,
      pushname TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_phone_number
      ON users(phone_number);
  `);
}

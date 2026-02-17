import type Database from 'better-sqlite3';

export function registerQuranSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quran_daily_reads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT NOT NULL,
      pages INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_quran_daily_reads_user_created_at
      ON quran_daily_reads(user, created_at);

    CREATE INDEX IF NOT EXISTS idx_quran_daily_reads_created_at
      ON quran_daily_reads(created_at);
  `);
}

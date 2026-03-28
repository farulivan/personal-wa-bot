import type Database from 'better-sqlite3';

function normalizeExistingUserIds(db: Database.Database): void {
  const readsTableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='quran_daily_reads'`)
    .get();

  if (readsTableExists) {
    db.exec(`
      UPDATE quran_daily_reads
      SET user = REPLACE(REPLACE(REPLACE(user, '@c.us', ''), '@lid', ''), '@g.us', '')
      WHERE user LIKE '%@c.us' OR user LIKE '%@lid' OR user LIKE '%@g.us'
    `);
  }

  const marksTableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='quran_marks'`)
    .get();

  if (marksTableExists) {
    db.exec(`
      UPDATE quran_marks
      SET user = REPLACE(REPLACE(REPLACE(user, '@c.us', ''), '@lid', ''), '@g.us', '')
      WHERE user LIKE '%@c.us' OR user LIKE '%@lid' OR user LIKE '%@g.us'
    `);
  }
}

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

    CREATE TABLE IF NOT EXISTS quran_marks (
      user TEXT PRIMARY KEY,
      page INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_quran_marks_updated_at
      ON quran_marks(updated_at);
  `);

  normalizeExistingUserIds(db);
}

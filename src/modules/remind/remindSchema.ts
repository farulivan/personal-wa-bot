import type Database from 'better-sqlite3';

export function registerRemindSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      target_chat_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('group', 'direct')),
      reminder_text TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_reminders_user_created
      ON reminders(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_reminders_pending_schedule
      ON reminders(sent_at, scheduled_at);
  `);
}

import type { Database } from 'better-sqlite3';
import type {
  DueReminderRow,
  NewReminder,
  RemindRepository,
  ReminderListRow,
  ReminderSourceType,
} from './remindRepository.js';

type DbReminderRow = {
  id: number;
  user_id: string;
  target_chat_id: string;
  source_type: ReminderSourceType;
  reminder_text: string;
  scheduled_at: string;
  created_at: string;
  sent_at: string | null;
};

function toReminderListRow(row: DbReminderRow): ReminderListRow {
  return {
    id: row.id,
    userId: row.user_id,
    targetChatId: row.target_chat_id,
    sourceType: row.source_type,
    reminderText: row.reminder_text,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}

export class SqliteRemindRepository implements RemindRepository {
  constructor(private readonly db: Database) {}

  insertReminder(input: NewReminder): void {
    this.db
      .prepare(
        `INSERT INTO reminders (
          user_id,
          target_chat_id,
          source_type,
          reminder_text,
          scheduled_at,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.userId,
        input.targetChatId,
        input.sourceType,
        input.reminderText,
        input.scheduledAt,
        input.createdAt
      );
  }

  countByUser(userId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS total FROM reminders WHERE user_id = ?')
      .get(userId) as { total: number };

    return row.total;
  }

  countActiveByUser(userId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS total FROM reminders WHERE user_id = ? AND sent_at IS NULL')
      .get(userId) as { total: number };

    return row.total;
  }

  listByUser(userId: string, limit: number, offset: number): ReminderListRow[] {
    const rows = this.db
      .prepare(
        `SELECT
          id,
          user_id,
          target_chat_id,
          source_type,
          reminder_text,
          scheduled_at,
          created_at,
          sent_at
         FROM reminders
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(userId, limit, offset) as DbReminderRow[];

    return rows.map(toReminderListRow);
  }

  listDuePending(nowIso: string, limit: number): DueReminderRow[] {
    const rows = this.db
      .prepare(
        `SELECT
          id,
          user_id,
          target_chat_id,
          source_type,
          reminder_text,
          scheduled_at,
          created_at,
          sent_at
         FROM reminders
         WHERE sent_at IS NULL
           AND scheduled_at <= ?
         ORDER BY scheduled_at ASC
         LIMIT ?`
      )
      .all(nowIso, limit) as DbReminderRow[];

    return rows.map(toReminderListRow);
  }

  markAsSent(id: number, sentAt: string): void {
    this.db
      .prepare(
        `UPDATE reminders
         SET sent_at = ?
         WHERE id = ? AND sent_at IS NULL`
      )
      .run(sentAt, id);
  }
}

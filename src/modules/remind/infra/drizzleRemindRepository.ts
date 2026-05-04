import { eq, sql, count, isNull, and } from 'drizzle-orm';
import type { DrizzleDb } from '../../../db/drizzle.js';
import { reminders } from './schema.js';
import type {
  RemindRepository,
  NewReminder,
  ReminderListRow,
  DueReminderRow,
  ReminderSourceType,
} from './remindRepository.js';

function toReminderListRow(row: {
  id: number;
  userId: string;
  targetChatId: string;
  sourceType: string;
  reminderText: string;
  scheduledAt: string;
  createdAt: string;
  sentAt: string | null;
}): ReminderListRow {
  return {
    id: row.id,
    userId: row.userId,
    targetChatId: row.targetChatId,
    sourceType: row.sourceType as ReminderSourceType,
    reminderText: row.reminderText,
    scheduledAt: row.scheduledAt,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
  };
}

export class DrizzleRemindRepository implements RemindRepository {
  constructor(private readonly db: DrizzleDb) {}

  async insertReminder(input: NewReminder): Promise<void> {
    await this.db.insert(reminders).values({
      userId: input.userId,
      targetChatId: input.targetChatId,
      sourceType: input.sourceType,
      reminderText: input.reminderText,
      scheduledAt: input.scheduledAt,
      createdAt: input.createdAt,
    });
  }

  async countByUser(userId: string): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(reminders)
      .where(and(eq(reminders.userId, userId), isNull(reminders.deletedAt)));

    return rows[0]?.total ?? 0;
  }

  async countActiveByUser(userId: string): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(reminders)
      .where(
        and(eq(reminders.userId, userId), isNull(reminders.sentAt), isNull(reminders.deletedAt))
      );

    return rows[0]?.total ?? 0;
  }

  async listByUser(userId: string, limit: number, offset: number): Promise<ReminderListRow[]> {
    const rows = await this.db
      .select({
        id: reminders.id,
        userId: reminders.userId,
        targetChatId: reminders.targetChatId,
        sourceType: reminders.sourceType,
        reminderText: reminders.reminderText,
        scheduledAt: reminders.scheduledAt,
        createdAt: reminders.createdAt,
        sentAt: reminders.sentAt,
      })
      .from(reminders)
      .where(and(eq(reminders.userId, userId), isNull(reminders.deletedAt)))
      .orderBy(sql`${reminders.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    return rows.map(toReminderListRow);
  }

  async claimDueReminders(nowIso: string, limit: number): Promise<DueReminderRow[]> {
    const result = await this.db.execute(sql`
      UPDATE ${reminders}
      SET sent_at = ${nowIso}
      WHERE id IN (
        SELECT id FROM ${reminders}
        WHERE sent_at IS NULL
          AND deleted_at IS NULL
          AND scheduled_at <= ${nowIso}
        ORDER BY scheduled_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id,
        user_id AS "userId",
        target_chat_id AS "targetChatId",
        source_type AS "sourceType",
        reminder_text AS "reminderText",
        scheduled_at AS "scheduledAt",
        created_at AS "createdAt",
        sent_at AS "sentAt"
    `);

    return (
      result as unknown as Array<{
        id: number;
        userId: string;
        targetChatId: string;
        sourceType: string;
        reminderText: string;
        scheduledAt: string;
        createdAt: string;
        sentAt: string | null;
      }>
    ).map(toReminderListRow);
  }

  async markAsSent(id: number, sentAt: string): Promise<void> {
    await this.db
      .update(reminders)
      .set({ sentAt })
      .where(and(eq(reminders.id, id), isNull(reminders.sentAt), isNull(reminders.deletedAt)));
  }

  async findLastActiveByUser(userId: string): Promise<ReminderListRow | null> {
    const rows = await this.db
      .select({
        id: reminders.id,
        userId: reminders.userId,
        targetChatId: reminders.targetChatId,
        sourceType: reminders.sourceType,
        reminderText: reminders.reminderText,
        scheduledAt: reminders.scheduledAt,
        createdAt: reminders.createdAt,
        sentAt: reminders.sentAt,
      })
      .from(reminders)
      .where(
        and(eq(reminders.userId, userId), isNull(reminders.sentAt), isNull(reminders.deletedAt))
      )
      .orderBy(sql`${reminders.createdAt} DESC`)
      .limit(1);

    return rows[0] ? toReminderListRow(rows[0]) : null;
  }

  async softDeleteById(id: number, deletedAtIso: string): Promise<void> {
    await this.db
      .update(reminders)
      .set({ deletedAt: deletedAtIso })
      .where(and(eq(reminders.id, id), isNull(reminders.deletedAt)));
  }
}

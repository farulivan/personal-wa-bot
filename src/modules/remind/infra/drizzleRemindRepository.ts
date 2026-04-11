import { eq, sql, count, isNull, and, lte } from 'drizzle-orm';
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
      .where(eq(reminders.userId, userId));

    return rows[0]?.total ?? 0;
  }

  async countActiveByUser(userId: string): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(reminders)
      .where(and(eq(reminders.userId, userId), isNull(reminders.sentAt)));

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
      .where(eq(reminders.userId, userId))
      .orderBy(sql`${reminders.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    return rows.map(toReminderListRow);
  }

  async listDuePending(nowIso: string, limit: number): Promise<DueReminderRow[]> {
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
      .where(and(isNull(reminders.sentAt), lte(reminders.scheduledAt, nowIso)))
      .orderBy(sql`${reminders.scheduledAt} ASC`)
      .limit(limit);

    return rows.map(toReminderListRow);
  }

  async markAsSent(id: number, sentAt: string): Promise<void> {
    await this.db
      .update(reminders)
      .set({ sentAt })
      .where(and(eq(reminders.id, id), isNull(reminders.sentAt)));
  }
}

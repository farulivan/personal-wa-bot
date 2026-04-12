import { pgTable, serial, text, index } from 'drizzle-orm/pg-core';

export const reminders = pgTable(
  'reminders',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    targetChatId: text('target_chat_id').notNull(),
    sourceType: text('source_type').notNull(),
    reminderText: text('reminder_text').notNull(),
    scheduledAt: text('scheduled_at').notNull(),
    createdAt: text('created_at').notNull(),
    sentAt: text('sent_at'),
  },
  (table) => [
    index('idx_reminders_user_created').on(table.userId, table.createdAt),
    index('idx_reminders_pending_schedule').on(table.sentAt, table.scheduledAt),
  ]
);

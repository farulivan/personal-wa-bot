import { pgTable, serial, text, integer, index } from 'drizzle-orm/pg-core';

export const quranDailyReads = pgTable(
  'quran_daily_reads',
  {
    id: serial('id').primaryKey(),
    user: text('user').notNull(),
    pages: integer('pages').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_quran_daily_reads_user_created_at').on(table.user, table.createdAt),
    index('idx_quran_daily_reads_created_at').on(table.createdAt),
  ]
);

export const quranMarks = pgTable('quran_marks', {
  user: text('user').primaryKey(),
  page: integer('page').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

import { pgTable, text, index } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    phoneNumber: text('phone_number'),
    contactName: text('contact_name'),
    pushname: text('pushname'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_users_phone_number').on(table.phoneNumber)]
);

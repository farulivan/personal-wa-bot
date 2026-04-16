import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core';

export const migrationTest = pgTable('_migration_test', {
  id: serial('id').primaryKey(),
  note: text('note'),
  verifyCount: integer('verify_count').default(0),
});

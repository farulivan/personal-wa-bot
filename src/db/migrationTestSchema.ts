import { pgTable, serial, text } from 'drizzle-orm/pg-core';

export const migrationTest = pgTable('_migration_test', {
  id: serial('id').primaryKey(),
  note: text('note'),
});

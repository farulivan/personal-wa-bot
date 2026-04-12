import { sql } from 'drizzle-orm';
import { createDrizzleDb } from './drizzle.js';
import type { DrizzleDb } from './drizzle.js';
import { runMigrations } from './migrate.js';
import * as schema from './schema.js';

const TEST_DB_URL = process.env.TEST_DATABASE_URL;

export function getTestDatabaseUrl(): string {
  if (!TEST_DB_URL) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Run: TEST_DATABASE_URL=postgresql://wabot:wabot@localhost:5432/wabot_test pnpm test:integration'
    );
  }
  return TEST_DB_URL;
}

export async function setupTestDb(): Promise<{ db: DrizzleDb; close: () => Promise<void> }> {
  const url = getTestDatabaseUrl();
  await runMigrations(url);
  const { db, close } = createDrizzleDb(url);
  return { db, close };
}

export async function cleanAllTables(db: DrizzleDb): Promise<void> {
  await db.delete(schema.reminders);
  await db.delete(schema.workouts);
  await db.delete(schema.quranDailyReads);
  await db.delete(schema.quranMarks);
  await db.delete(schema.sholatDailyCache);
  await db.delete(schema.sholatLocations).where(sql`true`);
  await db.delete(schema.users);
}

import { sql } from 'drizzle-orm';
import { inject } from 'vitest';
import { createDrizzleDb } from './drizzle.js';
import type { DrizzleDb } from './drizzle.js';
import { runMigrations } from './migrate.js';
import * as schema from './schema.js';

// Which database this is gets decided once, in integrationGlobalSetup.ts.
export function getTestDatabaseUrl(): string {
  return inject('testDatabaseUrl');
}

export async function setupTestDb(): Promise<{ db: DrizzleDb; close: () => Promise<void> }> {
  const url = getTestDatabaseUrl();
  await runMigrations(url);
  const { db, close } = createDrizzleDb(url);
  return { db, close };
}

export async function cleanAllTables(db: DrizzleDb): Promise<void> {
  await db.delete(schema.reminders);
  await db.delete(schema.workoutLifts);
  await db.delete(schema.workoutCardios);
  await db.delete(schema.quranDailyReads);
  await db.delete(schema.quranMarks);
  await db.delete(schema.sholatDailyCache);
  await db.delete(schema.sholatLocations).where(sql`true`);
  await db.delete(schema.users);
}

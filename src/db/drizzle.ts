import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type DrizzleConnection = {
  db: ReturnType<typeof drizzle>;
  close: () => Promise<void>;
};

export function createDrizzleDb(databaseUrl: string): DrizzleConnection {
  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}

export type DrizzleDb = DrizzleConnection['db'];

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { log, error } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMigrations(databaseUrl: string): Promise<void> {
  const migrationsFolder = resolve(__dirname, 'migrations');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const migrationClient = postgres(databaseUrl, { max: 1 });
    const db = drizzle(migrationClient);

    try {
      log({ attempt }, 'running database migrations');
      await migrate(db, { migrationsFolder });
      log('migrations complete');
      return;
    } catch (err) {
      error({ err, attempt }, 'migration failed');
      if (attempt === MAX_RETRIES) {
        throw err;
      }
      const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      log({ delayMs, attempt }, 'retrying migration');
      await sleep(delayMs);
    } finally {
      await migrationClient.end();
    }
  }
}

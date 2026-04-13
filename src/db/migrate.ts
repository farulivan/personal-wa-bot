import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { log, error } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(databaseUrl: string): Promise<void> {
  const migrationClient = postgres(databaseUrl, { max: 1 });
  const db = drizzle(migrationClient);

  log('running database migrations');

  try {
    await migrate(db, {
      migrationsFolder: resolve(__dirname, 'migrations'),
    });
    log('migrations complete');
  } catch (err) {
    error({ err }, 'migration failed');
    throw err;
  } finally {
    await migrationClient.end();
  }
}

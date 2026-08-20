import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { log, error } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A Postgres restart — Railway patching the image, a plan change, a crash — takes tens of
// seconds. Three tries over six seconds sat well inside that, so a bot that happened to boot
// during one exited and left the platform restarting it in a loop until the database came back.
// These delays add up to ninety seconds of waiting, which absorbs an ordinary restart in-process.
const MAX_ATTEMPTS = 7;
const INITIAL_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type RetryOptions = {
  attempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  /** Injectable so tests don't spend real time asleep. */
  sleep?: (ms: number) => Promise<void>;
  onAttempt?: (attempt: number) => void;
  onError?: (err: unknown, attempt: number) => void;
  onRetry?: (attempt: number, delayMs: number) => void;
};

/**
 * Run `task` until it succeeds, doubling the wait between tries and capping it so a long outage
 * doesn't collapse into one enormous sleep. Rethrows the last error once the attempts are spent.
 */
export async function retryWithBackoff<T>(
  task: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const wait = options.sleep ?? sleep;

  for (let attempt = 1; ; attempt++) {
    options.onAttempt?.(attempt);

    try {
      return await task();
    } catch (err) {
      options.onError?.(err, attempt);
      if (attempt >= options.attempts) throw err;

      const delayMs = Math.min(
        options.initialDelayMs * Math.pow(2, attempt - 1),
        options.maxDelayMs
      );
      options.onRetry?.(attempt, delayMs);
      await wait(delayMs);
    }
  }
}

export async function runMigrations(databaseUrl: string): Promise<void> {
  const migrationsFolder = resolve(__dirname, 'migrations');

  await retryWithBackoff(
    async () => {
      // A fresh client per attempt: one that failed to connect is not worth reusing.
      const migrationClient = postgres(databaseUrl, { max: 1, onnotice: () => {} });
      const db = drizzle(migrationClient);

      try {
        await migrate(db, { migrationsFolder });
        log('migrations complete');
      } finally {
        await migrationClient.end();
      }
    },
    {
      attempts: MAX_ATTEMPTS,
      initialDelayMs: INITIAL_DELAY_MS,
      maxDelayMs: MAX_DELAY_MS,
      onAttempt: (attempt) => log({ attempt }, 'running database migrations'),
      onError: (err, attempt) => error({ err, attempt }, 'migration failed'),
      onRetry: (attempt, delayMs) => log({ delayMs, attempt }, 'retrying migration'),
    }
  );
}

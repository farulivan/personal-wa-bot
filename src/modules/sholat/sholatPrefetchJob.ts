import { log, error } from '../../logger.js';
import type { SholatService } from './sholatService.js';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 30_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type PrefetchTodayScheduleDeps = {
  sholatService: Pick<SholatService, 'getTodaySchedule'>;
  now: () => Date;
  maxAttempts?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Warms today's prayer schedule into the DB cache once a day, with bounded retry for
 * transient upstream failures. The delivery ticker reads from this cache and never calls
 * the API itself, so all retrying is contained here (no unbounded per-minute retries).
 */
export async function prefetchTodaySchedule(deps: PrefetchTodayScheduleDeps): Promise<void> {
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const sleep = deps.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await deps.sholatService.getTodaySchedule('', deps.now());
      if (result.ok) {
        log(
          {
            location: result.value.locationName,
            date: result.value.schedule.scheduleDate,
            attempt,
          },
          '🕌 Sholat schedule prefetched for today'
        );
        return;
      }
      log(
        { attempt, maxAttempts, reason: result.error.type },
        '🕌 Sholat prefetch attempt failed, will retry if attempts remain'
      );
    } catch (err) {
      log(
        { attempt, maxAttempts, err },
        '🕌 Sholat prefetch attempt threw, will retry if attempts remain'
      );
    }

    if (attempt < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }

  error(
    { maxAttempts },
    "🕌 Sholat schedule prefetch failed after all attempts; today's reminders may be skipped"
  );
}

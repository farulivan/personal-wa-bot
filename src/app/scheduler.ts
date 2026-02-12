import { debug, log } from '../logger.js';

export type ScheduledJob = {
  name: string;
  hour: number;
  timezoneOffsetMinutes: number;
  run: () => Promise<void>;
};

function msUntilNextRun(hour: number, timezoneOffsetMinutes: number): number {
  const now = new Date();
  const userNow = new Date(now.getTime() + timezoneOffsetMinutes * 60000);

  const targetToday = new Date(
    Date.UTC(userNow.getUTCFullYear(), userNow.getUTCMonth(), userNow.getUTCDate(), hour, 0, 0)
  );
  // Convert target back to UTC
  const targetUtc = new Date(targetToday.getTime() - timezoneOffsetMinutes * 60000);

  let ms = targetUtc.getTime() - now.getTime();
  if (ms <= 0) {
    // Already past today's target, schedule for tomorrow
    ms += 24 * 60 * 60 * 1000;
  }
  return ms;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function startScheduler(jobs: ScheduledJob[]): void {
  for (const job of jobs) {
    const ms = msUntilNextRun(job.hour, job.timezoneOffsetMinutes);
    const minutesUntil = Math.round(ms / 60000);

    log(`⏰ Scheduled "${job.name}" — first run in ${minutesUntil} min`);

    setTimeout(() => {
      debug(`⏰ Running "${job.name}" (first run)`);
      job.run().catch((err) => debug(`⏰ Job "${job.name}" failed:`, err));

      setInterval(() => {
        debug(`⏰ Running "${job.name}" (interval)`);
        job.run().catch((err) => debug(`⏰ Job "${job.name}" failed:`, err));
      }, DAY_MS);
    }, ms);
  }
}

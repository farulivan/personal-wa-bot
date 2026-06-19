import { debug, log, error } from '../logger.js';

export type ScheduledJob = {
  name: string;
  hour: number;
  minute: number;
  timezoneOffsetMinutes: number;
  dayOfMonth?: number;
  run: () => Promise<void>;
};

export type SchedulerHandle = { stop: () => void };

export function getUserLocalTime(
  timezoneOffsetMinutes: number,
  now: Date = new Date()
): {
  hour: number;
  minute: number;
  day: number;
  dateString: string;
} {
  const userNow = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
  const y = userNow.getUTCFullYear();
  const m = String(userNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(userNow.getUTCDate()).padStart(2, '0');
  return {
    hour: userNow.getUTCHours(),
    minute: userNow.getUTCMinutes(),
    day: userNow.getUTCDate(),
    dateString: `${y}-${m}-${d}`,
  };
}

function msUntilNextMinute(): number {
  const now = new Date();
  return 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
}

export function startScheduler(jobs: ScheduledJob[]): SchedulerHandle {
  const lastFired = new Map<string, string>();
  let ticker: ReturnType<typeof setInterval> | null = null;

  const tick = () => {
    for (const job of jobs) {
      const { hour, minute, day, dateString } = getUserLocalTime(job.timezoneOffsetMinutes);
      if (hour !== job.hour || minute !== job.minute) continue;
      if (job.dayOfMonth !== undefined && day !== job.dayOfMonth) continue;

      const key = `${hour}:${minute}:${dateString}`;
      if (lastFired.get(job.name) === key) continue;

      lastFired.set(job.name, key);
      debug({ job: job.name }, 'running scheduled job');
      job.run().catch((err) => error({ err, job: job.name }, 'scheduled job failed'));
    }
  };

  for (const job of jobs) {
    const time = `${String(job.hour).padStart(2, '0')}:${String(job.minute).padStart(2, '0')}`;
    if (job.dayOfMonth !== undefined) {
      log({ job: job.name, time, dayOfMonth: job.dayOfMonth }, 'scheduled monthly job');
    } else {
      log({ job: job.name, time }, 'scheduled daily job');
    }
  }

  // Align first tick to the next minute boundary, then tick every minute
  const alignTimeout = setTimeout(() => {
    tick();
    ticker = setInterval(tick, 60000);
  }, msUntilNextMinute());

  return {
    stop() {
      clearTimeout(alignTimeout);
      if (ticker) clearInterval(ticker);
    },
  };
}

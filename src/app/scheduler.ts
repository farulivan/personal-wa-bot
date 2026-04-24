import { debug, log, error } from '../logger.js';

export type ScheduledJob = {
  name: string;
  hour: number;
  minute: number;
  timezoneOffsetMinutes: number;
  run: () => Promise<void>;
};

export type SchedulerHandle = { stop: () => void };

function getUserHourMinute(timezoneOffsetMinutes: number): { hour: number; minute: number } {
  const now = new Date();
  const userNow = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
  return { hour: userNow.getUTCHours(), minute: userNow.getUTCMinutes() };
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
      const { hour, minute } = getUserHourMinute(job.timezoneOffsetMinutes);
      if (hour !== job.hour || minute !== job.minute) continue;

      const key = `${hour}:${minute}:${new Date().toISOString().slice(0, 10)}`;
      if (lastFired.get(job.name) === key) continue;

      lastFired.set(job.name, key);
      debug({ job: job.name }, 'running scheduled job');
      job.run().catch((err) => error({ err, job: job.name }, 'scheduled job failed'));
    }
  };

  for (const job of jobs) {
    const time = `${String(job.hour).padStart(2, '0')}:${String(job.minute).padStart(2, '0')}`;
    log({ job: job.name, time }, 'scheduled daily job');
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

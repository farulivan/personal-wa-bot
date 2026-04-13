import { debug, log } from '../logger.js';

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
      if (hour === job.hour && minute === job.minute) {
        const key = `${job.name}:${new Date().toISOString().slice(0, 16)}`;
        if (lastFired.get(job.name) !== key) {
          lastFired.set(job.name, key);
          debug(`⏰ Running "${job.name}"`);
          job.run().catch((err) => debug(`⏰ Job "${job.name}" failed:`, err));
        }
      }
    }
  };

  for (const job of jobs) {
    log(
      `⏰ Scheduled "${job.name}" — runs daily at ${String(job.hour).padStart(2, '0')}:${String(job.minute).padStart(2, '0')} (user time)`
    );
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

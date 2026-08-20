import { debug, log, error } from '../logger.js';

export type ScheduledJob = {
  name: string;
  hour: number;
  minute: number;
  timezoneOffsetMinutes: number;
  dayOfMonth?: number;
  /**
   * How long after its scheduled minute a job may still run, if it has not succeeded yet.
   *
   * Leave it unset for a job that must fire on its exact minute or not at all — the nightly
   * restart is the example, since running it late is worse than not running it.
   */
  catchUpMinutes?: number;
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

function msUntilNextMinute(now: Date): number {
  return 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
}

/**
 * Decides which jobs are due and runs them. Holds the per-day state — which jobs have already
 * succeeded today, and which are still in flight — so it can be driven tick-by-tick: directly
 * in tests, or on a one-minute interval via startScheduler.
 *
 * A job is marked done only once its run resolves. The earlier version stamped the attempt
 * before running and matched on the exact minute, so a single transient failure — a Postgres
 * restart, a WhatsApp hiccup — silently cost that day's message with no second try.
 */
export class ScheduledJobTicker {
  private readonly succeededOn = new Map<string, string>();
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly jobs: ScheduledJob[],
    private readonly startedAt: Date = new Date()
  ) {}

  async tick(now: Date): Promise<void> {
    const due = this.jobs.filter((job) => this.isDue(job, now));
    await Promise.all(due.map((job) => this.runJob(job, now)));
  }

  private isDue(job: ScheduledJob, now: Date): boolean {
    const { hour, minute, day, dateString } = getUserLocalTime(job.timezoneOffsetMinutes, now);

    if (job.dayOfMonth !== undefined && day !== job.dayOfMonth) return false;
    if (this.succeededOn.get(job.name) === dateString) return false;
    if (this.inFlight.has(job.name)) return false;

    // Minutes since the slot opened. Negative before it, and negative again after local
    // midnight — a catch-up window deliberately does not reach back into yesterday.
    const elapsed = hour * 60 + minute - (job.hour * 60 + job.minute);

    if (job.catchUpMinutes === undefined) return elapsed === 0;
    if (elapsed < 0 || elapsed > job.catchUpMinutes) return false;

    // Only retry a slot we were actually present for. After a restart there is no way to know
    // whether the previous process already sent this one, and ADR 0001's reasoning applies here
    // too: a digest that goes missing is better than one that arrives twice.
    const aliveMinutes = (now.getTime() - this.startedAt.getTime()) / 60000;
    return aliveMinutes >= elapsed;
  }

  private async runJob(job: ScheduledJob, now: Date): Promise<void> {
    const { dateString } = getUserLocalTime(job.timezoneOffsetMinutes, now);

    this.inFlight.add(job.name);
    debug({ job: job.name }, 'running scheduled job');

    try {
      await job.run();
      this.succeededOn.set(job.name, dateString);
    } catch (err) {
      // Deliberately not stamped: a job with a catch-up window gets another go on the next
      // tick inside it, and one without is already out of chances for today.
      error({ err, job: job.name }, 'scheduled job failed');
    } finally {
      this.inFlight.delete(job.name);
    }
  }
}

export function startScheduler(
  jobs: ScheduledJob[],
  now: () => Date = () => new Date()
): SchedulerHandle {
  const ticker = new ScheduledJobTicker(jobs, now());
  let interval: ReturnType<typeof setInterval> | null = null;

  const runTick = () => {
    // Per-job failures are handled inside the ticker; this guards the tick itself, so a bug in
    // the due check surfaces as a log line rather than an unhandled rejection that kills us.
    void ticker.tick(now()).catch((err) => error({ err }, 'scheduler tick failed'));
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
    runTick();
    interval = setInterval(runTick, 60000);
  }, msUntilNextMinute(now()));

  return {
    stop() {
      clearTimeout(alignTimeout);
      if (interval) clearInterval(interval);
    },
  };
}

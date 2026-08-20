import { describe, it, expect } from 'vitest';
import { ScheduledJobTicker, getUserLocalTime } from './scheduler.js';
import type { ScheduledJob } from './scheduler.js';

const TZ = 420; // GMT+7

// All times below are GMT+7 written as UTC: 08:00 local == 01:00Z.
const at = (hhmm: string) => new Date(`2026-08-20T${hhmm}:00Z`);
const SEVEN_AM = at('00:00'); // 07:00 local — an hour before the 08:00 slot

type Recorder = {
  job: ScheduledJob;
  runs: number;
  fail: boolean;
};

function digestJob(overrides: Partial<ScheduledJob> = {}): Recorder {
  const rec: Recorder = { runs: 0, fail: false, job: null as unknown as ScheduledJob };
  rec.job = {
    name: 'digest',
    hour: 8,
    minute: 0,
    timezoneOffsetMinutes: TZ,
    catchUpMinutes: 30,
    run: async () => {
      rec.runs += 1;
      if (rec.fail) throw new Error('database is restarting');
    },
    ...overrides,
  };
  return rec;
}

describe('getUserLocalTime', () => {
  it('shifts UTC into the user timezone', () => {
    expect(getUserLocalTime(TZ, at('01:00'))).toEqual({
      hour: 8,
      minute: 0,
      day: 20,
      dateString: '2026-08-20',
    });
  });
});

describe('ScheduledJobTicker', () => {
  it('runs a job on its scheduled minute', async () => {
    const rec = digestJob();
    const ticker = new ScheduledJobTicker([rec.job], SEVEN_AM);

    await ticker.tick(at('01:00'));

    expect(rec.runs).toBe(1);
  });

  it('does not run before the scheduled minute', async () => {
    const rec = digestJob();
    const ticker = new ScheduledJobTicker([rec.job], SEVEN_AM);

    await ticker.tick(at('00:59'));

    expect(rec.runs).toBe(0);
  });

  it('does not run a second time once it has succeeded today', async () => {
    const rec = digestJob();
    const ticker = new ScheduledJobTicker([rec.job], SEVEN_AM);

    await ticker.tick(at('01:00'));
    await ticker.tick(at('01:01'));
    await ticker.tick(at('01:20'));

    expect(rec.runs).toBe(1);
  });

  it('retries inside the catch-up window after a failure', async () => {
    // The whole point: a Postgres restart across 08:00 used to cost the day's digest.
    const rec = digestJob();
    rec.fail = true;
    const ticker = new ScheduledJobTicker([rec.job], SEVEN_AM);

    await ticker.tick(at('01:00'));
    expect(rec.runs).toBe(1);

    rec.fail = false;
    await ticker.tick(at('01:01'));

    expect(rec.runs).toBe(2);
  });

  it('stops retrying once the catch-up window has passed', async () => {
    const rec = digestJob();
    rec.fail = true;
    const ticker = new ScheduledJobTicker([rec.job], SEVEN_AM);

    await ticker.tick(at('01:00'));
    await ticker.tick(at('01:29')); // last minute of the window
    await ticker.tick(at('01:31')); // past it

    expect(rec.runs).toBe(2);
  });

  it('gives a job without a catch-up window exactly one attempt', async () => {
    // The nightly restart relies on this: fire on the minute or not at all.
    const rec = digestJob({ name: 'scheduled-restart', catchUpMinutes: undefined });
    rec.fail = true;
    const ticker = new ScheduledJobTicker([rec.job], SEVEN_AM);

    await ticker.tick(at('01:00'));
    await ticker.tick(at('01:01'));

    expect(rec.runs).toBe(1);
  });

  it('does not catch up a slot it was not running for', async () => {
    // A process that booted at 08:15 cannot know whether the one it replaced already sent the
    // 08:00 digest, so it stays quiet rather than risk a duplicate.
    const rec = digestJob();
    const ticker = new ScheduledJobTicker([rec.job], at('01:15'));

    await ticker.tick(at('01:16'));

    expect(rec.runs).toBe(0);
  });

  it('runs again the next day', async () => {
    const rec = digestJob();
    const ticker = new ScheduledJobTicker([rec.job], SEVEN_AM);

    await ticker.tick(at('01:00'));
    await ticker.tick(new Date('2026-08-21T01:00:00Z'));

    expect(rec.runs).toBe(2);
  });

  it('only runs a monthly job on its day of the month', async () => {
    const rec = digestJob({ dayOfMonth: 1 });
    const ticker = new ScheduledJobTicker([rec.job], SEVEN_AM);

    await ticker.tick(at('01:00')); // the 20th
    expect(rec.runs).toBe(0);

    await ticker.tick(new Date('2026-09-01T01:00:00Z'));
    expect(rec.runs).toBe(1);
  });

  it('does not start a job that is still running', async () => {
    let release: () => void = () => {};
    let runs = 0;
    const job: ScheduledJob = {
      name: 'slow',
      hour: 8,
      minute: 0,
      timezoneOffsetMinutes: TZ,
      catchUpMinutes: 30,
      run: () => {
        runs += 1;
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    };
    const ticker = new ScheduledJobTicker([job], SEVEN_AM);

    const first = ticker.tick(at('01:00'));
    await ticker.tick(at('01:01'));
    expect(runs).toBe(1);

    release();
    await first;
    expect(runs).toBe(1);
  });

  it('lets one failing job run the others in the same tick', async () => {
    const failing = digestJob({ name: 'failing' });
    failing.fail = true;
    const healthy = digestJob({ name: 'healthy' });
    const ticker = new ScheduledJobTicker([failing.job, healthy.job], SEVEN_AM);

    await ticker.tick(at('01:00'));

    expect(failing.runs).toBe(1);
    expect(healthy.runs).toBe(1);
  });
});

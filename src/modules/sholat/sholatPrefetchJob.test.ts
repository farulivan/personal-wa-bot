import { describe, it, expect } from 'vitest';
import { prefetchTodaySchedule } from './sholatPrefetchJob.js';
import { ok, err } from '../../shared/result.js';
import type { TodayScheduleResult } from './sholatService.js';

function okSchedule(): TodayScheduleResult {
  return ok({
    locationName: 'KAB. BOGOR',
    schedule: {
      locationId: '1302',
      scheduleDate: '2026-06-17',
      timezone: 'Asia/Jakarta',
      displayDate: 'Rabu, 17 Jun 2026',
      imsak: '04:30',
      subuh: '04:40',
      terbit: '05:50',
      dhuha: '06:15',
      dzuhur: '11:57',
      ashar: '15:10',
      maghrib: '17:49',
      isya: '19:00',
    },
  });
}

type Behavior = 'ok' | 'throw' | 'err';

class FakeService {
  calls = 0;

  constructor(private readonly behaviors: Behavior[]) {}

  async getTodaySchedule(_locationArg: string, _now: Date): Promise<TodayScheduleResult> {
    const behavior = this.behaviors[this.calls] ?? this.behaviors[this.behaviors.length - 1];
    this.calls++;
    if (behavior === 'throw') throw new Error('upstream down');
    if (behavior === 'err') return err({ type: 'notfound', input: '' });
    return okSchedule();
  }
}

describe('prefetchTodaySchedule', () => {
  const now = () => new Date('2026-06-17T00:05:00+07:00');

  function run(behaviors: Behavior[]) {
    const service = new FakeService(behaviors);
    const sleeps: number[] = [];
    const promise = prefetchTodaySchedule({
      sholatService: service,
      now,
      maxAttempts: 3,
      retryDelayMs: 5,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    return { service, sleeps, promise };
  }

  it('fetches once and does not retry on success', async () => {
    const { service, sleeps, promise } = run(['ok']);
    await promise;
    expect(service.calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it('retries transient exceptions then succeeds', async () => {
    const { service, sleeps, promise } = run(['throw', 'throw', 'ok']);
    await promise;
    expect(service.calls).toBe(3);
    expect(sleeps).toEqual([5, 5]);
  });

  it('retries non-ok Result outcomes too', async () => {
    const { service, sleeps, promise } = run(['err', 'ok']);
    await promise;
    expect(service.calls).toBe(2);
    expect(sleeps).toEqual([5]);
  });

  it('gives up after max attempts (sleeps only between attempts)', async () => {
    const { service, sleeps, promise } = run(['throw']);
    await promise;
    expect(service.calls).toBe(3);
    expect(sleeps).toEqual([5, 5]);
  });
});

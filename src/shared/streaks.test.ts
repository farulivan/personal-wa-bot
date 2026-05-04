import { describe, it, expect } from 'vitest';
import { computeStreaks } from './streaks.js';

const TZ_UTC7 = 420; // UTC+7 in minutes

describe('computeStreaks', () => {
  const now = new Date('2026-04-08T10:00:00Z'); // local date = 2026-04-08 in UTC+7

  it('returns {current:0, best:0} for empty days', () => {
    expect(computeStreaks([], TZ_UTC7, now)).toEqual({ current: 0, best: 0 });
  });

  it('returns current=1 when only today qualifies', () => {
    const result = computeStreaks(['2026-04-08'], TZ_UTC7, now);
    expect(result.current).toBe(1);
    expect(result.best).toBe(1);
  });

  it('returns current=1 when only yesterday qualifies', () => {
    const result = computeStreaks(['2026-04-07'], TZ_UTC7, now);
    expect(result.current).toBe(1);
    expect(result.best).toBe(1);
  });

  it('returns current=0 when latest day is 2+ days ago', () => {
    const result = computeStreaks(['2026-04-06'], TZ_UTC7, now);
    expect(result.current).toBe(0);
    expect(result.best).toBe(1);
  });

  it('counts consecutive days for current streak', () => {
    const days = ['2026-04-08', '2026-04-07', '2026-04-06', '2026-04-05'];
    const result = computeStreaks(days, TZ_UTC7, now);
    expect(result.current).toBe(4);
    expect(result.best).toBe(4);
  });

  it('breaks current streak on gap', () => {
    const days = ['2026-04-08', '2026-04-07', '2026-04-05']; // gap on 06
    const result = computeStreaks(days, TZ_UTC7, now);
    expect(result.current).toBe(2);
    expect(result.best).toBe(2);
  });

  it('best streak tracks longest consecutive run even if not active', () => {
    // best run is 2020 (5 days), current run is 2 days
    const days = [
      '2026-04-08',
      '2026-04-07',
      '2020-06-05',
      '2020-06-04',
      '2020-06-03',
      '2020-06-02',
      '2020-06-01',
    ];
    const result = computeStreaks(days, TZ_UTC7, now);
    expect(result.current).toBe(2);
    expect(result.best).toBe(5);
  });

  it('best is always >= current', () => {
    const days = ['2026-04-08', '2026-04-07', '2026-04-06'];
    const result = computeStreaks(days, TZ_UTC7, now);
    expect(result.best).toBeGreaterThanOrEqual(result.current);
  });
});

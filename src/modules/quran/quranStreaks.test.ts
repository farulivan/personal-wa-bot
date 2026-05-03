import { describe, it, expect } from 'vitest';
import { computeQuranStreaks } from './quranStreaks.js';

const TZ_UTC7 = 420;

describe('computeQuranStreaks', () => {
  const now = new Date('2026-04-08T10:00:00Z'); // local = 2026-04-08 in UTC+7

  it('returns zeros for empty days', () => {
    expect(computeQuranStreaks([], TZ_UTC7, now)).toEqual({ current: 0, best: 0 });
  });

  it('counts today as streak=1', () => {
    expect(computeQuranStreaks(['2026-04-08'], TZ_UTC7, now)).toEqual({ current: 1, best: 1 });
  });

  it('counts yesterday as streak=1', () => {
    expect(computeQuranStreaks(['2026-04-07'], TZ_UTC7, now)).toEqual({ current: 1, best: 1 });
  });

  it('returns current=0 if latest day is 2+ days ago', () => {
    const result = computeQuranStreaks(['2026-04-06'], TZ_UTC7, now);
    expect(result.current).toBe(0);
    expect(result.best).toBe(1);
  });

  it('counts consecutive streak correctly', () => {
    const days = ['2026-04-08', '2026-04-07', '2026-04-06'];
    expect(computeQuranStreaks(days, TZ_UTC7, now)).toEqual({ current: 3, best: 3 });
  });

  it('stops current streak at gap', () => {
    const days = ['2026-04-08', '2026-04-07', '2026-04-05']; // gap on 06
    const result = computeQuranStreaks(days, TZ_UTC7, now);
    expect(result.current).toBe(2);
  });

  it('tracks best streak across old runs', () => {
    const days = [
      '2026-04-08',
      '2026-04-07',
      '2020-06-05',
      '2020-06-04',
      '2020-06-03',
      '2020-06-02',
      '2020-06-01',
    ];
    const result = computeQuranStreaks(days, TZ_UTC7, now);
    expect(result.current).toBe(2);
    expect(result.best).toBe(5);
  });
});

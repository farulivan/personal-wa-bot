import { describe, it, expect } from 'vitest';
import { computeStreaks } from './streaks.js';

const TZ_UTC7 = 420; // UTC+7 in minutes

describe('computeStreaks', () => {
  const now = new Date('2026-04-08T10:00:00Z'); // local date = 2026-04-08 in UTC+7

  it('returns {current:0, best:0} for empty days', () => {
    expect(computeStreaks([], TZ_UTC7, now)).toEqual({ current: 0, best: 0, atRisk: false });
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

  it('returns current=1 when latest day is exactly 2 days ago (rest-day tolerance)', () => {
    const result = computeStreaks(['2026-04-06'], TZ_UTC7, now); // T-2
    expect(result.current).toBe(1);
    expect(result.best).toBe(1);
  });

  it('returns current=0 when latest day is 3+ days ago', () => {
    const result = computeStreaks(['2026-04-05'], TZ_UTC7, now); // T-3
    expect(result.current).toBe(0);
    expect(result.best).toBe(1);
  });

  it('counts consecutive days for current streak', () => {
    const days = ['2026-04-08', '2026-04-07', '2026-04-06', '2026-04-05'];
    const result = computeStreaks(days, TZ_UTC7, now);
    expect(result.current).toBe(4);
    expect(result.best).toBe(4);
  });

  it('tolerates a single missed day (gap of 2) within the streak', () => {
    const days = ['2026-04-08', '2026-04-07', '2026-04-05']; // gap of 2 on 06
    const result = computeStreaks(days, TZ_UTC7, now);
    expect(result.current).toBe(3);
    expect(result.best).toBe(3);
  });

  it('breaks current streak on gap of 3+', () => {
    const days = ['2026-04-08', '2026-04-07', '2026-04-04']; // gap of 3
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

  // --- rest-day tolerance (new rule: gap of 1 or 2 continues chain) ---

  it('chain with all gaps of 2: [T, T-2, T-4] → current=3, best=3', () => {
    // 2026-04-08, 2026-04-06, 2026-04-04
    const days = ['2026-04-08', '2026-04-06', '2026-04-04'];
    const result = computeStreaks(days, TZ_UTC7, now);
    expect(result.current).toBe(3);
    expect(result.best).toBe(3);
  });

  it('gap of 3 breaks chain: [T, T-1, T-4] → current=2, best=2', () => {
    // 2026-04-08, 2026-04-07, 2026-04-04 — gap of 3 between T-1 and T-4
    const days = ['2026-04-08', '2026-04-07', '2026-04-04'];
    const result = computeStreaks(days, TZ_UTC7, now);
    expect(result.current).toBe(2);
    expect(result.best).toBe(2);
  });

  it('best-streak in history: [T-10, T-12, T-14, T-20] → best=3', () => {
    // 2026-03-29, 2026-03-27, 2026-03-25 connected (gap 2 each), then gap 6 to 2026-03-19
    const days = ['2026-03-29', '2026-03-27', '2026-03-25', '2026-03-19'];
    const result = computeStreaks(days, TZ_UTC7, now);
    expect(result.current).toBe(0);
    expect(result.best).toBe(3);
  });

  it('mixed gaps of 1 and 2: [T, T-1, T-3, T-4, T-6] → current=5, best=5', () => {
    // 2026-04-08, 2026-04-07, 2026-04-05, 2026-04-04, 2026-04-02
    const days = ['2026-04-08', '2026-04-07', '2026-04-05', '2026-04-04', '2026-04-02'];
    const result = computeStreaks(days, TZ_UTC7, now);
    expect(result.current).toBe(5);
    expect(result.best).toBe(5);
  });

  // --- atRisk ---

  it('atRisk: true when last qualifying day is exactly T-2 (single day)', () => {
    // now = 2026-04-08, T-2 = 2026-04-06
    const result = computeStreaks(['2026-04-06'], TZ_UTC7, now);
    expect(result.current).toBe(1);
    expect(result.atRisk).toBe(true);
  });

  it('atRisk: true when chain ends at T-2', () => {
    // 2026-04-06, 2026-04-05, 2026-04-04 — chain of 3 ending at T-2
    const days = ['2026-04-06', '2026-04-05', '2026-04-04'];
    const result = computeStreaks(days, TZ_UTC7, now);
    expect(result.current).toBe(3);
    expect(result.atRisk).toBe(true);
  });

  it('atRisk: false when last qualifying day is today', () => {
    const result = computeStreaks(['2026-04-08'], TZ_UTC7, now);
    expect(result.atRisk).toBe(false);
  });

  it('atRisk: false when last qualifying day is yesterday', () => {
    const result = computeStreaks(['2026-04-07'], TZ_UTC7, now);
    expect(result.atRisk).toBe(false);
  });

  it('atRisk: false when streak is 0 (last qualifying day is T-3 or earlier)', () => {
    const result = computeStreaks(['2026-04-05'], TZ_UTC7, now); // T-3 → current=0
    expect(result.current).toBe(0);
    expect(result.atRisk).toBe(false);
  });

  it('atRisk: false for empty days', () => {
    const result = computeStreaks([], TZ_UTC7, now);
    expect(result.atRisk).toBe(false);
  });
});

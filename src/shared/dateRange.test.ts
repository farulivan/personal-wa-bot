import { describe, it, expect } from 'vitest';
import { toUserDate, getCurrentMonthDateRange } from './dateRange.js';

const TZ_UTC7 = 420; // UTC+7 in minutes

describe('toUserDate', () => {
  it('converts UTC date to user local date string', () => {
    const utc = new Date('2026-01-15T00:00:00Z');
    expect(toUserDate(utc, TZ_UTC7)).toBe('2026-01-15');
  });

  it('accounts for timezone offset pushing into next day', () => {
    // 23:00 UTC = 06:00 next day UTC+7
    const utc = new Date('2026-01-14T23:00:00Z');
    expect(toUserDate(utc, TZ_UTC7)).toBe('2026-01-15');
  });

  it('accounts for negative offset', () => {
    // 01:00 UTC = 20:00 previous day UTC-5
    const utc = new Date('2026-01-15T01:00:00Z');
    expect(toUserDate(utc, -300)).toBe('2026-01-14');
  });
});

describe('getCurrentMonthDateRange', () => {
  it('returns first and last day of the current local month', () => {
    const now = new Date('2026-03-15T05:00:00Z');
    expect(getCurrentMonthDateRange(now, TZ_UTC7)).toEqual({
      startDateInclusive: '2026-03-01',
      endDateInclusive: '2026-03-31',
    });
  });

  it('handles February in a non-leap year', () => {
    const now = new Date('2026-02-10T00:00:00Z');
    expect(getCurrentMonthDateRange(now, TZ_UTC7)).toEqual({
      startDateInclusive: '2026-02-01',
      endDateInclusive: '2026-02-28',
    });
  });

  it('rolls into the next local month when offset crosses month boundary', () => {
    // 31 Jan 23:00 UTC = 1 Feb 06:00 UTC+7 — local month is February
    const now = new Date('2026-01-31T23:00:00Z');
    expect(getCurrentMonthDateRange(now, TZ_UTC7)).toEqual({
      startDateInclusive: '2026-02-01',
      endDateInclusive: '2026-02-28',
    });
  });
});

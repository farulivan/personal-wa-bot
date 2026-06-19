import { describe, it, expect } from 'vitest';
import { findDuePrayers } from './sholatPrayerTimes.js';

const schedule = {
  subuh: '04:40',
  dzuhur: '11:57',
  ashar: '15:10',
  maghrib: '17:49',
  isya: '19:00',
};

describe('findDuePrayers', () => {
  it('returns the matching prayer at its exact time', () => {
    expect(findDuePrayers(schedule, '11:57')).toEqual([
      { key: 'dzuhur', label: 'Dzuhur', time: '11:57' },
    ]);
  });

  it('returns empty when no prayer matches the minute', () => {
    expect(findDuePrayers(schedule, '12:00')).toEqual([]);
  });

  it('matches the first and last prayers of the day', () => {
    expect(findDuePrayers(schedule, '04:40').map((p) => p.key)).toEqual(['subuh']);
    expect(findDuePrayers(schedule, '19:00').map((p) => p.key)).toEqual(['isya']);
  });

  it('returns multiple prayers if they share the same minute', () => {
    const collide = { ...schedule, ashar: '11:57' };
    expect(findDuePrayers(collide, '11:57').map((p) => p.key)).toEqual(['dzuhur', 'ashar']);
  });
});

import { toUserDate } from './dateRange.js';

export type StreakInfo = {
  current: number;
  best: number;
  atRisk: boolean;
};

// Compute current and best streak from pre-filtered qualifying days (sorted DESC).
// Caller filters to days that qualify (e.g. days hitting workout threshold, or
// any day with a quran read). Current streak anchors within today-or-2-days-ago.
// A single missed day (gap of 2) is tolerated; a gap of 3+ breaks the chain.
export function computeStreaks(
  days: string[],
  timezoneOffsetMinutes: number,
  now: Date
): StreakInfo {
  if (days.length === 0) return { current: 0, best: 0, atRisk: false };

  const today = toUserDate(now, timezoneOffsetMinutes);
  const twoDaysAgo = toUserDate(new Date(now.getTime() - 2 * 86400000), timezoneOffsetMinutes);

  let current = 0;
  if (days[0] >= twoDaysAgo && days[0] <= today) {
    current = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(`${days[i - 1]}T00:00:00Z`);
      const curr = new Date(`${days[i]}T00:00:00Z`);
      const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
      if (diffDays <= 2) {
        current++;
      } else {
        break;
      }
    }
  }

  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(`${days[i - 1]}T00:00:00Z`);
    const curr = new Date(`${days[i]}T00:00:00Z`);
    const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
    if (diffDays <= 2) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }

  if (best < current) best = current;

  const atRisk = current > 0 && days[0] === twoDaysAgo;

  return { current, best, atRisk };
}

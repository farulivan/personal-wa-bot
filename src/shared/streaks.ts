import { toUserDate } from './dateRange.js';

export type StreakInfo = {
  current: number;
  best: number;
  atRisk: boolean;
};

// Compute current and best streak from pre-filtered qualifying days (sorted DESC).
// Caller filters to days that qualify (e.g. days hitting workout threshold, or
// any day with a quran read). restDayTolerance (default 0 = strict) controls how
// many consecutive missed days are forgiven: anchor cut-off = today − (1 + tolerance),
// max gap in a chain = 1 + tolerance.
export function computeStreaks(
  days: string[],
  timezoneOffsetMinutes: number,
  now: Date,
  restDayTolerance: number = 0
): StreakInfo {
  if (days.length === 0) return { current: 0, best: 0, atRisk: false };

  const today = toUserDate(now, timezoneOffsetMinutes);
  const cutoffMs = (1 + restDayTolerance) * 86400000;
  const cutoff = toUserDate(new Date(now.getTime() - cutoffMs), timezoneOffsetMinutes);
  const maxGap = 1 + restDayTolerance;

  let current = 0;
  if (days[0] >= cutoff && days[0] <= today) {
    current = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(`${days[i - 1]}T00:00:00Z`);
      const curr = new Date(`${days[i]}T00:00:00Z`);
      const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
      if (diffDays <= maxGap) {
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
    if (diffDays <= maxGap) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }

  if (best < current) best = current;

  const atRisk = current > 0 && days[0] === cutoff;

  return { current, best, atRisk };
}

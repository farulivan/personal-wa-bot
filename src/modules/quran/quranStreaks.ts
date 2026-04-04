export type StreakInfo = {
  current: number;
  best: number;
};

// Returns the user's local date string (YYYY-MM-DD) for a given UTC timestamp
export function toUserDate(utcDate: Date, timezoneOffsetMinutes: number): string {
  const local = new Date(utcDate.getTime() + timezoneOffsetMinutes * 60000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Compute current and best streak from pre-fetched read days (DESC order)
export function computeQuranStreaks(
  days: string[],
  timezoneOffsetMinutes: number,
  now: Date
): StreakInfo {
  if (days.length === 0) return { current: 0, best: 0 };

  const today = toUserDate(now, timezoneOffsetMinutes);
  const yesterday = toUserDate(new Date(now.getTime() - 86400000), timezoneOffsetMinutes);

  let current = 0;
  if (days[0] === today || days[0] === yesterday) {
    current = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(`${days[i - 1]}T00:00:00Z`);
      const curr = new Date(`${days[i]}T00:00:00Z`);
      const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
      if (diffDays === 1) {
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
    if (diffDays === 1) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }

  if (best < current) best = current;

  return { current, best };
}

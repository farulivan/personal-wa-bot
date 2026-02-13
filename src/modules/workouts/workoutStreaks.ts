import type { Database } from 'better-sqlite3';
import { MIN_WORKOUTS_FOR_STREAK } from '../../app/constants.js';
import { debug } from '../../logger.js';

type DayCountRow = { day: string; cnt: number };

// Returns the user's local date string (YYYY-MM-DD) for a given UTC timestamp
function toUserDate(utcDate: Date, timezoneOffsetMinutes: number): string {
  const local = new Date(utcDate.getTime() + timezoneOffsetMinutes * 60000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Get qualifying days (>= MIN_WORKOUTS_PER_DAY) sorted descending
function getQualifyingDays(db: Database, sender: string, timezoneOffsetMinutes: number): string[] {
  // SQLite: shift created_at by timezone offset, extract date, count per day
  const offsetSeconds = timezoneOffsetMinutes * 60;
  const rows = db
    .prepare(
      `SELECT date(created_at, '+${offsetSeconds} seconds') AS day, COUNT(*) AS cnt
     FROM workouts
     WHERE user = ?
     GROUP BY day
     HAVING cnt >= ?
     ORDER BY day DESC`
    )
    .all(sender, MIN_WORKOUTS_FOR_STREAK) as DayCountRow[];

  return rows.map((r) => r.day);
}

// Count workouts for today (user's local date)
export function getTodayWorkoutCount(
  db: Database,
  sender: string,
  timezoneOffsetMinutes: number,
  now: Date
): number {
  const today = toUserDate(now, timezoneOffsetMinutes);
  const offsetSeconds = timezoneOffsetMinutes * 60;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM workouts
     WHERE user = ? AND date(created_at, '+${offsetSeconds} seconds') = ?`
    )
    .get(sender, today) as { cnt: number };
  return row.cnt;
}

export type StreakInfo = {
  current: number;
  best: number;
};

// Compute current and best streak from qualifying days
export function computeStreaks(
  db: Database,
  sender: string,
  timezoneOffsetMinutes: number,
  now: Date
): StreakInfo {
  const days = getQualifyingDays(db, sender, timezoneOffsetMinutes);
  const today = toUserDate(now, timezoneOffsetMinutes);
  const yesterday = toUserDate(new Date(now.getTime() - 86400000), timezoneOffsetMinutes);
  debug(
    `🔥 computeStreaks: sender="${sender}", today="${today}", yesterday="${yesterday}", qualifyingDays=[${days.slice(0, 10).join(', ')}] (${days.length} total)`
  );
  if (days.length === 0) return { current: 0, best: 0 };

  // Current streak: must include today or yesterday to be "active"
  let current = 0;
  if (days[0] === today || days[0] === yesterday) {
    current = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1] + 'T00:00:00Z');
      const curr = new Date(days[i] + 'T00:00:00Z');
      const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
      if (diffDays === 1) {
        current++;
      } else {
        break;
      }
    }
  }

  // Best streak: scan all qualifying days for longest consecutive run
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1] + 'T00:00:00Z');
    const curr = new Date(days[i] + 'T00:00:00Z');
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

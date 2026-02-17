import type { Database } from 'better-sqlite3';

type DayRow = { localDate: string };

function toUserDate(utcDate: Date, timezoneOffsetMinutes: number): string {
  const local = new Date(utcDate.getTime() + timezoneOffsetMinutes * 60000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getReadDays(db: Database, user: string, timezoneOffsetMinutes: number): string[] {
  const offsetSeconds = timezoneOffsetMinutes * 60;

  const rows = db
    .prepare(
      `SELECT date(created_at, '+${offsetSeconds} seconds') AS localDate
       FROM quran_daily_reads
       WHERE user = ? AND pages > 0
       GROUP BY localDate
       ORDER BY localDate DESC`
    )
    .all(user) as DayRow[];

  return rows.map((row) => row.localDate);
}

export type StreakInfo = {
  current: number;
  best: number;
};

export function hasReadToday(
  db: Database,
  user: string,
  timezoneOffsetMinutes: number,
  now: Date
): boolean {
  const today = toUserDate(now, timezoneOffsetMinutes);
  const offsetSeconds = timezoneOffsetMinutes * 60;

  const row = db
    .prepare(
      `SELECT 1
       FROM quran_daily_reads
       WHERE user = ?
         AND date(created_at, '+${offsetSeconds} seconds') = date(?)
         AND pages > 0
       LIMIT 1`
    )
    .get(user, today);

  return Boolean(row);
}

export function computeQuranStreaks(
  db: Database,
  user: string,
  timezoneOffsetMinutes: number,
  now: Date
): StreakInfo {
  const days = getReadDays(db, user, timezoneOffsetMinutes);
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

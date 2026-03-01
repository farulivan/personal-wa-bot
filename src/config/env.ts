function parseIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.trunc(parsed);
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  return fallback;
}

const allowedNumbersEnv = process.env.ALLOWED_NUMBERS || '';

export const appConfig = {
  userTimezoneOffsetMinutes: parseIntegerEnv('USER_TIMEZONE_OFFSET_MINUTES', 420),
  minWorkoutsForStreak: parseIntegerEnv('MIN_WORKOUTS_FOR_STREAK', 3),
  workoutListLimit: parseIntegerEnv('WORKOUT_LIST_LIMIT', 10),
  quranListLimit: parseIntegerEnv('QURAN_LIST_LIMIT', 10),
  remindListLimit: parseIntegerEnv('REMIND_LIST_LIMIT', 10),
  quranRamadhanCountEnabled: parseBooleanEnv('QURAN_RAMADHAN_COUNT_ENABLED', false),
  quranRamadhanStartDate: process.env.QURAN_RAMADHAN_START_DATE || '',
  quranRamadhanEndDate: process.env.QURAN_RAMADHAN_END_DATE || '',
  dailyDigestHour: parseIntegerEnv('DAILY_DIGEST_HOUR', 8),
  dailyDigestMinute: parseIntegerEnv('DAILY_DIGEST_MINUTE', 0),
  quranReminderHour: parseIntegerEnv('QURAN_REMINDER_HOUR', 22),
  quranReminderMinute: parseIntegerEnv('QURAN_REMINDER_MINUTE', 0),
  digestGroupId: process.env.DIGEST_GROUP_ID || '',
  sholatDefaultLocation: process.env.SHOLAT_DEFAULT_LOCATION || 'KAB. BOGOR',
  sholatTimezone: process.env.SHOLAT_TIMEZONE || 'Asia/Jakarta',
  allowedNumbers: new Set(
    allowedNumbersEnv
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
  ),
} as const;

export type AppConfig = typeof appConfig;

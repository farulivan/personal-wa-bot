function parseIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.trunc(parsed);
}

const allowedNumbersEnv = process.env.ALLOWED_NUMBERS || '';

export const appConfig = {
  userTimezoneOffsetMinutes: parseIntegerEnv('USER_TIMEZONE_OFFSET_MINUTES', 420),
  minWorkoutsForStreak: parseIntegerEnv('MIN_WORKOUTS_FOR_STREAK', 3),
  workoutListLimit: parseIntegerEnv('WORKOUT_LIST_LIMIT', 10),
  dailyDigestHour: parseIntegerEnv('DAILY_DIGEST_HOUR', 8),
  dailyDigestMinute: parseIntegerEnv('DAILY_DIGEST_MINUTE', 0),
  digestGroupId: process.env.DIGEST_GROUP_ID || '',
  allowedNumbers: new Set(
    allowedNumbersEnv
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
  ),
} as const;

export type AppConfig = typeof appConfig;

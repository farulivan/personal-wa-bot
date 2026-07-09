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

/**
 * Parses the comma-separated `DIGEST_GROUP_IDS` list: entries are trimmed,
 * empties dropped, and duplicates removed (first occurrence wins).
 */
export function parseGroupIds(idsRaw: string): string[] {
  const ids = idsRaw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return [...new Set(ids)];
}

const allowedNumbersEnv = process.env.ALLOWED_NUMBERS || '';

export const appConfig = {
  databaseUrl: process.env.DATABASE_URL || '',
  userTimezoneOffsetMinutes: parseIntegerEnv('USER_TIMEZONE_OFFSET_MINUTES', 420),
  minWorkoutsForStreak: parseIntegerEnv('MIN_WORKOUTS_FOR_STREAK', 3),
  workoutListLimit: parseIntegerEnv('WORKOUT_LIST_LIMIT', 10),
  quranListLimit: parseIntegerEnv('QURAN_LIST_LIMIT', 10),
  remindListLimit: parseIntegerEnv('REMIND_LIST_LIMIT', 10),
  remindActiveLimit: parseIntegerEnv('REMIND_ACTIVE_LIMIT', 50),
  quranRamadhanCountEnabled: parseBooleanEnv('QURAN_RAMADHAN_COUNT_ENABLED', false),
  quranRamadhanStartDate: process.env.QURAN_RAMADHAN_START_DATE || '',
  quranRamadhanEndDate: process.env.QURAN_RAMADHAN_END_DATE || '',
  dailyDigestHour: parseIntegerEnv('DAILY_DIGEST_HOUR', 8),
  dailyDigestMinute: parseIntegerEnv('DAILY_DIGEST_MINUTE', 0),
  monthlyDigestHour: parseIntegerEnv('MONTHLY_DIGEST_HOUR', 8),
  monthlyDigestMinute: parseIntegerEnv('MONTHLY_DIGEST_MINUTE', 0),
  quranReminderHour: parseIntegerEnv('QURAN_REMINDER_HOUR', 22),
  quranReminderMinute: parseIntegerEnv('QURAN_REMINDER_MINUTE', 0),
  scheduledRestartEnabled: parseBooleanEnv('SCHEDULED_RESTART_ENABLED', true),
  scheduledRestartHour: parseIntegerEnv('SCHEDULED_RESTART_HOUR', 3),
  scheduledRestartMinute: parseIntegerEnv('SCHEDULED_RESTART_MINUTE', 0),
  digestGroupIds: parseGroupIds(process.env.DIGEST_GROUP_IDS || ''),
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

function isIsoDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value));
}

export function validateConfig(config: AppConfig): void {
  const errors: string[] = [];

  if (!config.databaseUrl) {
    errors.push('DATABASE_URL is required');
  }

  if (config.dailyDigestHour < 0 || config.dailyDigestHour > 23) {
    errors.push(`DAILY_DIGEST_HOUR must be 0-23, got ${config.dailyDigestHour}`);
  }
  if (config.dailyDigestMinute < 0 || config.dailyDigestMinute > 59) {
    errors.push(`DAILY_DIGEST_MINUTE must be 0-59, got ${config.dailyDigestMinute}`);
  }
  if (config.monthlyDigestHour < 0 || config.monthlyDigestHour > 23) {
    errors.push(`MONTHLY_DIGEST_HOUR must be 0-23, got ${config.monthlyDigestHour}`);
  }
  if (config.monthlyDigestMinute < 0 || config.monthlyDigestMinute > 59) {
    errors.push(`MONTHLY_DIGEST_MINUTE must be 0-59, got ${config.monthlyDigestMinute}`);
  }
  if (config.quranReminderHour < 0 || config.quranReminderHour > 23) {
    errors.push(`QURAN_REMINDER_HOUR must be 0-23, got ${config.quranReminderHour}`);
  }
  if (config.quranReminderMinute < 0 || config.quranReminderMinute > 59) {
    errors.push(`QURAN_REMINDER_MINUTE must be 0-59, got ${config.quranReminderMinute}`);
  }
  if (config.scheduledRestartHour < 0 || config.scheduledRestartHour > 23) {
    errors.push(`SCHEDULED_RESTART_HOUR must be 0-23, got ${config.scheduledRestartHour}`);
  }
  if (config.scheduledRestartMinute < 0 || config.scheduledRestartMinute > 59) {
    errors.push(`SCHEDULED_RESTART_MINUTE must be 0-59, got ${config.scheduledRestartMinute}`);
  }
  if (config.minWorkoutsForStreak < 1) {
    errors.push(`MIN_WORKOUTS_FOR_STREAK must be >= 1, got ${config.minWorkoutsForStreak}`);
  }

  if (config.quranRamadhanCountEnabled) {
    if (!config.quranRamadhanStartDate || !isIsoDateString(config.quranRamadhanStartDate)) {
      errors.push(
        'QURAN_RAMADHAN_START_DATE must be a valid YYYY-MM-DD date when QURAN_RAMADHAN_COUNT_ENABLED is true'
      );
    }
    if (!config.quranRamadhanEndDate || !isIsoDateString(config.quranRamadhanEndDate)) {
      errors.push(
        'QURAN_RAMADHAN_END_DATE must be a valid YYYY-MM-DD date when QURAN_RAMADHAN_COUNT_ENABLED is true'
      );
    }
  }

  if (config.allowedNumbers.size === 0) {
    console.warn('⚠️  ALLOWED_NUMBERS is empty — bot will reject all commands');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
  }
}

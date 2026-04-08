import { debug } from '../logger.js';

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
  databaseUrl: process.env.DATABASE_URL || '',
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

// User timezone offset in minutes (UTC+7 = 420 minutes)
export const USER_TIMEZONE_OFFSET = appConfig.userTimezoneOffsetMinutes;

// Minimum workouts per day to count as a streak day
export const MIN_WORKOUTS_FOR_STREAK = appConfig.minWorkoutsForStreak;

// Number of recent workouts to show in --list
export const WORKOUT_LIST_LIMIT = appConfig.workoutListLimit;

// Number of recent quran daily reads to show in --list
export const QURAN_LIST_LIMIT = appConfig.quranListLimit;

// Number of recent reminders to show in --list
export const REMIND_LIST_LIMIT = appConfig.remindListLimit;

// Temporary Ramadhan counter settings for quran --list
export const QURAN_RAMADHAN_COUNT_ENABLED = appConfig.quranRamadhanCountEnabled;
export const QURAN_RAMADHAN_START_DATE = appConfig.quranRamadhanStartDate;
export const QURAN_RAMADHAN_END_DATE = appConfig.quranRamadhanEndDate;

// Time in user timezone to send daily digest (24h format)
export const DAILY_DIGEST_HOUR = appConfig.dailyDigestHour;
export const DAILY_DIGEST_MINUTE = appConfig.dailyDigestMinute;

// Time in user timezone to send quran reminder (24h format)
export const QURAN_REMINDER_HOUR = appConfig.quranReminderHour;
export const QURAN_REMINDER_MINUTE = appConfig.quranReminderMinute;

// WhatsApp group chat ID for daily digest (set via env var)
export const DIGEST_GROUP_ID = appConfig.digestGroupId;

// Allowed phone numbers that can interact with the bot
// Format: comma-separated, e.g., "6281234567890,6289876543210"
// Set via ALLOWED_NUMBERS environment variable
export const ALLOWED_NUMBERS: Set<string> = appConfig.allowedNumbers;

// If no numbers configured, bot will reject all messages (safe default)
export const isAllowedUser = (phoneNumber: string): boolean => {
  // Extract number from WhatsApp ID format (e.g., "6281234567890@c.us" → "6281234567890")
  const number = phoneNumber.replace(/@.*$/, '');

  debug(`📞 Checking sender: ${phoneNumber} → extracted: ${number}`);

  if (ALLOWED_NUMBERS.size === 0) {
    debug('⚠️ No ALLOWED_NUMBERS configured. Rejecting all messages.');
    return false;
  }

  const isAllowed = ALLOWED_NUMBERS.has(number);
  debug(`✅ Is allowed: ${isAllowed}`);
  return isAllowed;
};

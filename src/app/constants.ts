// User timezone offset in minutes (UTC+7 = 420 minutes)
export const USER_TIMEZONE_OFFSET = 420;

// Minimum workouts per day to count as a streak day
export const MIN_WORKOUTS_FOR_STREAK = 3;

// Number of recent workouts to show in --list
export const WORKOUT_LIST_LIMIT = 10;

// Time in user timezone to send daily digest (24h format)
export const DAILY_DIGEST_HOUR = 9;
export const DAILY_DIGEST_MINUTE = 25;

// WhatsApp group chat ID for daily digest (set via env var)
export const DIGEST_GROUP_ID = process.env.DIGEST_GROUP_ID || '';

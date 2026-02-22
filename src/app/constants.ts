import { appConfig } from '../config/env.js';

// User timezone offset in minutes (UTC+7 = 420 minutes)
export const USER_TIMEZONE_OFFSET = appConfig.userTimezoneOffsetMinutes;

// Minimum workouts per day to count as a streak day
export const MIN_WORKOUTS_FOR_STREAK = appConfig.minWorkoutsForStreak;

// Number of recent workouts to show in --list
export const WORKOUT_LIST_LIMIT = appConfig.workoutListLimit;

// Number of recent quran daily reads to show in --list
export const QURAN_LIST_LIMIT = appConfig.quranListLimit;

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

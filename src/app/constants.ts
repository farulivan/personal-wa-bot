import { appConfig } from '../config/env.js';

// User timezone offset in minutes (UTC+7 = 420 minutes)
export const USER_TIMEZONE_OFFSET = appConfig.userTimezoneOffsetMinutes;

// Minimum workouts per day to count as a streak day
export const MIN_WORKOUTS_FOR_STREAK = appConfig.minWorkoutsForStreak;

// Number of recent workouts to show in --list
export const WORKOUT_LIST_LIMIT = appConfig.workoutListLimit;

// Time in user timezone to send daily digest (24h format)
export const DAILY_DIGEST_HOUR = appConfig.dailyDigestHour;
export const DAILY_DIGEST_MINUTE = appConfig.dailyDigestMinute;

// WhatsApp group chat ID for daily digest (set via env var)
export const DIGEST_GROUP_ID = appConfig.digestGroupId;

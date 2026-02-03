import { appConfig } from '../config/app.config.js';

// Get current time in user's timezone
export function getUserNow(): Date {
  return new Date(Date.now() + appConfig.timezone.offsetMinutes * 60000);
}

// Get user's current hour (0-23)
export function getUserHour(): number {
  return getUserNow().getUTCHours();
}

// Convert UTC date to user's timezone
export function toUserTimezone(date: Date): Date {
  return new Date(date.getTime() + appConfig.timezone.offsetMinutes * 60000);
}

// Get today's date at midnight in user's timezone
export function getUserToday(): Date {
  const userNow = getUserNow();
  return new Date(userNow.getUTCFullYear(), userNow.getUTCMonth(), userNow.getUTCDate());
}

// Get yesterday's date at midnight in user's timezone
export function getUserYesterday(): Date {
  return new Date(getUserToday().getTime() - 86400000);
}

// Get date-only (midnight) from a user timezone date
export function getDateOnly(userDate: Date): Date {
  return new Date(userDate.getUTCFullYear(), userDate.getUTCMonth(), userDate.getUTCDate());
}

// Format a date relative to today (Today, Yesterday, or YYYY/MM/DD)
export function formatRelativeDate(utcDateString: string): string {
  const date = new Date(utcDateString);
  const userDate = toUserTimezone(date);
  const dateOnly = getDateOnly(userDate);

  const today = getUserToday();
  const yesterday = getUserYesterday();

  if (dateOnly.getTime() === today.getTime()) {
    return 'Today';
  } else if (dateOnly.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  } else {
    const [year, month, day] = utcDateString.split('T')[0].split('-');
    return `${year}/${month}/${day}`;
  }
}

import { ok, err } from '../../shared/result.js';
import type { Result } from '../../shared/result.js';
export { tokenize, parsePageNumber } from '../../shared/parsing.js';

const REMINDER_TEXT_MAX_CHARS = 200;

export type ParsedReminderCommand = {
  dateInput: string;
  hour: number;
  minute: number;
  reminderText: string;
};

export type ParseTimeInfo = { hour: number; minute: number; normalized: string };
export type ParseDateInfo = { year: number; month: number; day: number; normalized: string };

export type ParseTimeResult = Result<ParseTimeInfo>;
export type ParseDateResult = Result<ParseDateInfo>;
export type ParseReminderResult = Result<ParsedReminderCommand>;

export function parseDateInput(rawDate: string): ParseDateResult {
  const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return err(
      `The date format is invalid. Please use YYYY-MM-DD.\n` +
        `Example: #remind 2026-03-10 10:30 Follow up proposal`
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const candidate = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() + 1 === month &&
    candidate.getUTCDate() === day;

  if (!isValid) {
    return err(`The date ${rawDate} is not valid. Please double-check the day and month.`);
  }

  return ok({ year, month, day, normalized: rawDate });
}

export function parseTimeInput(rawTime: string): ParseTimeResult {
  const cleaned = rawTime.trim().toLowerCase();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{1,2}))?(am|pm)?$/i);

  if (!match) {
    return err(
      `The time format is invalid. Use HH, HH:MM, HHam/HHpm, or HH:MMam/HH:MMpm.\n` +
        `Example: 10 | 10:15 | 10pm | 10:21pm`
    );
  }

  const rawHour = Number(match[1]);
  const rawMinute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3] ? match[3].toLowerCase() : '';

  if (rawMinute < 0 || rawMinute > 59) {
    return err(`Minutes must be in the 00-59 range.`);
  }

  if (meridiem) {
    if (rawHour < 1 || rawHour > 12) {
      return err(`For am/pm format, the hour must be between 1 and 12.`);
    }
    let hour24 = rawHour % 12;
    if (meridiem === 'pm') hour24 += 12;
    return ok({
      hour: hour24,
      minute: rawMinute,
      normalized: `${String(hour24).padStart(2, '0')}:${String(rawMinute).padStart(2, '0')}`,
    });
  }

  if (rawHour < 0 || rawHour > 23) {
    return err(`Hour must be in the 0-23 range.`);
  }

  return ok({
    hour: rawHour,
    minute: rawMinute,
    normalized: `${String(rawHour).padStart(2, '0')}:${String(rawMinute).padStart(2, '0')}`,
  });
}

export function parseReminderCommand(firstLine: string): ParseReminderResult {
  const normalized = firstLine.trim().replace(/\s+/g, ' ');
  const match = normalized.match(/^#remind\s+(\S+)\s+(\S+)\s+(.+)$/i);

  if (!match) {
    return err(
      `I couldn't parse that reminder format yet.\n\n` +
        `Please use: #remind YYYY-MM-DD|today|tomorrow HH:MM <message>\n` +
        `Examples: #remind 2026-03-10 10:30 Review proposal | #remind tomorrow 9am Team sync`
    );
  }

  const timeResult = parseTimeInput(match[2]);
  if (!timeResult.ok) return timeResult;

  const reminderText = match[3].trim();
  if (!reminderText) {
    return err(`Please include the reminder message so I can deliver it clearly.`);
  }

  if (reminderText.length > REMINDER_TEXT_MAX_CHARS) {
    return err(
      `Your reminder message is too long (${reminderText.length} characters).\n` +
        `Please keep it within ${REMINDER_TEXT_MAX_CHARS} characters for reliable delivery.`
    );
  }

  return ok({
    dateInput: match[1],
    hour: timeResult.value.hour,
    minute: timeResult.value.minute,
    reminderText,
  });
}

export function resolveDateInput(
  rawDateInput: string,
  now: Date,
  timezoneOffsetMinutes: number
): ParseDateResult {
  const normalizedInput = rawDateInput.trim().toLowerCase();
  if (normalizedInput !== 'today' && normalizedInput !== 'tomorrow') {
    return parseDateInput(rawDateInput);
  }

  const userNow = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
  const userMidnightUtcMs = Date.UTC(
    userNow.getUTCFullYear(),
    userNow.getUTCMonth(),
    userNow.getUTCDate(),
    0,
    0,
    0,
    0
  );
  const dayOffset = normalizedInput === 'tomorrow' ? 1 : 0;
  const targetLocalDate = new Date(userMidnightUtcMs + dayOffset * 24 * 60 * 60 * 1000);

  const year = targetLocalDate.getUTCFullYear();
  const month = targetLocalDate.getUTCMonth() + 1;
  const day = targetLocalDate.getUTCDate();
  const normalized = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return ok({ year, month, day, normalized });
}

export function toScheduledUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezoneOffsetMinutes: number
): string {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - timezoneOffsetMinutes * 60000;
  return new Date(utcMs).toISOString();
}

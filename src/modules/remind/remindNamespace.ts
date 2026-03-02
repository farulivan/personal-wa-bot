import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { CommandInvocation } from '../../app/parseCommand.js';
import { REMIND_LIST_LIMIT } from '../../app/constants.js';
import { debug } from '../../logger.js';
import type { RemindRepository } from './infra/remindRepository.js';

type ParsedReminderCommand = {
  dateInput: string;
  hour: number;
  minute: number;
  reminderText: string;
};

const REMIND_NAMESPACE = 'remind';
const REMINDER_TEXT_MAX_CHARS = 200;
const REMINDER_ACTIVE_LIMIT = 50;

type ParseTimeResult =
  | { ok: true; hour: number; minute: number; normalized: string }
  | { ok: false; message: string };

type ParseDateResult =
  | { ok: true; year: number; month: number; day: number; normalized: string }
  | { ok: false; message: string };

function tokenize(firstLine: string): string[] {
  return firstLine.trim().split(/\s+/).filter(Boolean);
}

function parsePageNumber(firstLine: string): number {
  const tokens = tokenize(firstLine);
  const pageToken = tokens.find((token) => /^\d+$/.test(token));
  return pageToken ? Math.max(1, Number(pageToken)) : 1;
}

function toLocalDateTimeLabel(utcIso: string, timezoneOffsetMinutes: number): string {
  const utcDate = new Date(utcIso);
  const local = new Date(utcDate.getTime() + timezoneOffsetMinutes * 60000);

  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');
  const hour = String(local.getUTCHours()).padStart(2, '0');
  const minute = String(local.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function helpMessage(): string {
  return (
    `I can help you set reminders clearly and reliably. ⏰\n\n` +
    `Main format:\n` +
    `• #remind YYYY-MM-DD|today|tomorrow HH:MM <reminder text>\n\n` +
    `Example:\n` +
    `• #remind 2026-03-10 10:30 Review document\n` +
    `• #remind today 9am Join standup\n` +
    `• #remind tomorrow 8:15 Prepare morning update\n` +
    `• #remind 2026-03-10 10pm Start wind-down routine\n` +
    `View your reminders:\n` +
    `• #remind --list\n` +
    `• #remind --list 2\n\n` +
    `Safety limits:\n` +
    `• Message up to ${REMINDER_TEXT_MAX_CHARS} characters\n` +
    `• Up to ${REMINDER_ACTIVE_LIMIT} active reminders at a time`
  );
}

function parseDateInput(rawDate: string): ParseDateResult {
  const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return {
      ok: false,
      message:
        `The date format is invalid. Please use YYYY-MM-DD.\n` +
        `Example: #remind 2026-03-10 10:30 Follow up proposal`,
    };
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
    return {
      ok: false,
      message: `The date ${rawDate} is not valid. Please double-check the day and month.`,
    };
  }

  return { ok: true, year, month, day, normalized: rawDate };
}

function parseTimeInput(rawTime: string): ParseTimeResult {
  const cleaned = rawTime.trim().toLowerCase();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{1,2}))?(am|pm)?$/i);

  if (!match) {
    return {
      ok: false,
      message:
        `The time format is invalid. Use HH, HH:MM, HHam/HHpm, or HH:MMam/HH:MMpm.\n` +
        `Example: 10 | 10:15 | 10pm | 10:21pm`,
    };
  }

  const rawHour = Number(match[1]);
  const rawMinute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3] ? match[3].toLowerCase() : '';

  if (rawMinute < 0 || rawMinute > 59) {
    return {
      ok: false,
      message: `Minutes must be in the 00-59 range.`,
    };
  }

  if (meridiem) {
    if (rawHour < 1 || rawHour > 12) {
      return {
        ok: false,
        message: `For am/pm format, the hour must be between 1 and 12.`,
      };
    }

    let hour24 = rawHour % 12;
    if (meridiem === 'pm') {
      hour24 += 12;
    }

    return {
      ok: true,
      hour: hour24,
      minute: rawMinute,
      normalized: `${String(hour24).padStart(2, '0')}:${String(rawMinute).padStart(2, '0')}`,
    };
  }

  if (rawHour < 0 || rawHour > 23) {
    return {
      ok: false,
      message: `Hour must be in the 0-23 range.`,
    };
  }

  return {
    ok: true,
    hour: rawHour,
    minute: rawMinute,
    normalized: `${String(rawHour).padStart(2, '0')}:${String(rawMinute).padStart(2, '0')}`,
  };
}

function parseReminderCommand(
  firstLine: string
): { ok: true; value: ParsedReminderCommand } | { ok: false; message: string } {
  const normalized = firstLine.trim().replace(/\s+/g, ' ');
  const match = normalized.match(/^#remind\s+(\S+)\s+(\S+)\s+(.+)$/i);

  if (!match) {
    return {
      ok: false,
      message:
        `I couldn't parse that reminder format yet.\n\n` +
        `Please use: #remind YYYY-MM-DD|today|tomorrow HH:MM <message>\n` +
        `Examples: #remind 2026-03-10 10:30 Review proposal | #remind tomorrow 9am Team sync`,
    };
  }

  const timeResult = parseTimeInput(match[2]);
  if (!timeResult.ok) {
    return timeResult;
  }

  const reminderText = match[3].trim();
  if (!reminderText) {
    return {
      ok: false,
      message: `Please include the reminder message so I can deliver it clearly.`,
    };
  }

  if (reminderText.length > REMINDER_TEXT_MAX_CHARS) {
    return {
      ok: false,
      message:
        `Your reminder message is too long (${reminderText.length} characters).\n` +
        `Please keep it within ${REMINDER_TEXT_MAX_CHARS} characters for reliable delivery.`,
    };
  }

  return {
    ok: true,
    value: {
      dateInput: match[1],
      hour: timeResult.hour,
      minute: timeResult.minute,
      reminderText,
    },
  };
}

function resolveDateInput(
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

  return { ok: true, year, month, day, normalized };
}

function toScheduledUtcIso(
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

async function handleCreateReminder(
  ctx: Parameters<NamespaceHandler>[0],
  invocation: CommandInvocation,
  remindRepository: RemindRepository
): Promise<string> {
  const parsed = parseReminderCommand(invocation.firstLine);
  if (!parsed.ok) {
    return parsed.message;
  }

  const now = ctx.now();
  const dateResult = resolveDateInput(parsed.value.dateInput, now, ctx.timezoneOffsetMinutes);
  if (!dateResult.ok) {
    return dateResult.message;
  }

  const scheduledAt = toScheduledUtcIso(
    dateResult.year,
    dateResult.month,
    dateResult.day,
    parsed.value.hour,
    parsed.value.minute,
    ctx.timezoneOffsetMinutes
  );

  if (new Date(scheduledAt).getTime() <= now.getTime()) {
    return (
      `The reminder time must be in the future.\n` +
      `Please choose a time after now so I can send it on schedule.`
    );
  }

  const activeReminderCount = remindRepository.countActiveByUser(ctx.sender);
  if (activeReminderCount >= REMINDER_ACTIVE_LIMIT) {
    return (
      `You already have ${activeReminderCount} active reminders.\n` +
      `Please wait for some to be sent before adding new ones (max ${REMINDER_ACTIVE_LIMIT}).`
    );
  }

  remindRepository.insertReminder({
    userId: ctx.sender,
    targetChatId: ctx.replyChatId,
    sourceType: ctx.isGroupChat ? 'group' : 'direct',
    reminderText: parsed.value.reminderText,
    scheduledAt,
    createdAt: now.toISOString(),
  });

  const localDateTimeLabel = toLocalDateTimeLabel(scheduledAt, ctx.timezoneOffsetMinutes);
  const deliveryChannel = ctx.isGroupChat ? 'this group chat' : 'this direct chat';

  debug(
    `⏰ Reminder created by ${ctx.sender} for ${localDateTimeLabel} (chat=${ctx.replyChatId}, source=${ctx.isGroupChat ? 'group' : 'direct'})`
  );

  return (
    `Done — your reminder is saved ✅\n` +
    `Schedule: ${localDateTimeLabel} (GMT+7)\n` +
    `Delivery target: ${deliveryChannel}\n\n` +
    `Reminder message:\n${parsed.value.reminderText}`
  );
}

async function handleReminderList(
  ctx: Parameters<NamespaceHandler>[0],
  invocation: CommandInvocation,
  remindRepository: RemindRepository
): Promise<string> {
  const page = parsePageNumber(invocation.firstLine);
  const offset = (page - 1) * REMIND_LIST_LIMIT;

  const total = remindRepository.countByUser(ctx.sender);
  if (total === 0) {
    return (
      `You don't have any saved reminders yet.\n\n` +
      `Start with:\n` +
      `#remind 2026-03-10 10:30 Follow up proposal`
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / REMIND_LIST_LIMIT));
  if (page > totalPages) {
    return (
      `Page ${page} is out of range. Last page is ${totalPages}.\n\n` +
      `Try: #remind --list${totalPages > 1 ? ` ${totalPages}` : ''}`
    );
  }

  const now = ctx.now();
  const rows = remindRepository.listByUser(ctx.sender, REMIND_LIST_LIMIT, offset);

  const listText = rows
    .map((row) => {
      const localDateTimeLabel = toLocalDateTimeLabel(row.scheduledAt, ctx.timezoneOffsetMinutes);
      const channelLabel = row.sourceType === 'group' ? 'Group' : 'Direct';

      let statusLabel = 'Pending';
      if (row.sentAt) {
        statusLabel = 'Sent';
      } else if (new Date(row.scheduledAt).getTime() <= now.getTime()) {
        statusLabel = 'Due';
      }

      return (
        `• [${statusLabel}] ${localDateTimeLabel} (${channelLabel})\n` + `  ${row.reminderText}`
      );
    })
    .join('\n');

  let footer = '';
  if (totalPages > 1) {
    footer = `\n\n📄 Page ${page} of ${totalPages}`;
    if (page < totalPages) {
      footer += ` — #remind --list ${page + 1} for next page`;
    }
  }

  return `Your reminders ⏰\n\n${listText}${footer}`;
}

export function createRemindNamespaceHandler(remindRepository: RemindRepository): NamespaceHandler {
  return async (ctx, invocation) => {
    if (invocation.namespace !== REMIND_NAMESPACE) {
      return null;
    }

    const tokens = tokenize(invocation.firstLine);
    const actionToken = (tokens[1] || '').toLowerCase();

    const isHelp =
      invocation.subcommand === 'help' ||
      invocation.firstLine.toLowerCase().includes('--help') ||
      actionToken === 'help' ||
      tokens.length === 1;

    if (isHelp) {
      return helpMessage();
    }

    const isList = invocation.subcommand === 'list' || actionToken === 'list';
    if (isList) {
      return handleReminderList(ctx, invocation, remindRepository);
    }

    return handleCreateReminder(ctx, invocation, remindRepository);
  };
}

import type { ReminderListRow } from './infra/remindRepository.js';
import { REMIND_UNDO_WINDOW_MS } from './remindService.js';
import { formatMentionTag, phoneToMentionJid } from '../../shared/mentions.js';

const REMINDER_TEXT_MAX_CHARS = 200;
const REMINDER_ACTIVE_LIMIT = 50;

export function toLocalDateTimeLabel(utcIso: string, timezoneOffsetMinutes: number): string {
  const utcDate = new Date(utcIso);
  const local = new Date(utcDate.getTime() + timezoneOffsetMinutes * 60000);

  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');
  const hour = String(local.getUTCHours()).padStart(2, '0');
  const minute = String(local.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function formatHelpMessage(): string {
  const undoWindowMinutes = REMIND_UNDO_WINDOW_MS / 60_000;
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
    `• #remind list\n` +
    `• #remind list 2\n\n` +
    `Undo the last reminder (within ${undoWindowMinutes} minutes):\n` +
    `• #remind undo\n\n` +
    `Safety limits:\n` +
    `• Message up to ${REMINDER_TEXT_MAX_CHARS} characters\n` +
    `• Up to ${REMINDER_ACTIVE_LIMIT} active reminders at a time`
  );
}

export function formatReminderCreated(
  scheduledAt: string,
  timezoneOffsetMinutes: number,
  reminderText: string,
  isGroupChat: boolean
): string {
  const localDateTimeLabel = toLocalDateTimeLabel(scheduledAt, timezoneOffsetMinutes);
  const deliveryChannel = isGroupChat ? 'this group chat' : 'this direct chat';

  return (
    `Done — your reminder is saved ✅\n` +
    `Schedule: ${localDateTimeLabel} (GMT+7)\n` +
    `Delivery target: ${deliveryChannel}\n\n` +
    `Reminder message:\n${reminderText}`
  );
}

export function formatReminderList(
  rows: ReminderListRow[],
  page: number,
  totalPages: number,
  timezoneOffsetMinutes: number,
  now: Date
): string {
  const listText = rows
    .map((row) => {
      const localDateTimeLabel = toLocalDateTimeLabel(row.scheduledAt, timezoneOffsetMinutes);
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
      footer += ` — #remind list ${page + 1} for next page`;
    }
  }

  return `Your reminders ⏰\n\n${listText}${footer}`;
}

export function formatEmptyListMessage(): string {
  return (
    `You don't have any saved reminders yet.\n\n` +
    `Start with:\n` +
    `#remind 2026-03-10 10:30 Follow up proposal`
  );
}

export function formatListPageOverflowMessage(page: number, totalPages: number): string {
  return (
    `Page ${page} is out of range. Last page is ${totalPages}.\n\n` +
    `Try: #remind list${totalPages > 1 ? ` ${totalPages}` : ''}`
  );
}

export function formatPastTimeMessage(): string {
  return (
    `The reminder time must be in the future.\n` +
    `Please choose a time after now so I can send it on schedule.`
  );
}

export function formatActiveLimitMessage(activeCount: number): string {
  return (
    `You already have ${activeCount} active reminders.\n` +
    `Please wait for some to be sent before adding new ones (max ${REMINDER_ACTIVE_LIMIT}).`
  );
}

export function formatSchedulerReminderMessage(
  phoneNumber: string | null,
  name: string,
  reminderText: string,
  localDateTimeLabel: string,
  isGroupChat: boolean
): { text: string; mentions: string[] } {
  const useMention = isGroupChat && phoneNumber !== null;
  const target = useMention ? formatMentionTag(phoneNumber) : name;
  return {
    text:
      `Reminder for ${target} ⏰\n` +
      `Schedule: ${localDateTimeLabel} (GMT+7)\n\n` +
      `${reminderText}\n\n` +
      `Hope this helps you stay on track.`,
    mentions: useMention ? [phoneToMentionJid(phoneNumber)] : [],
  };
}

export function formatUndoSuccess(entry: ReminderListRow, timezoneOffsetMinutes: number): string {
  const scheduleLabel = toLocalDateTimeLabel(entry.scheduledAt, timezoneOffsetMinutes);
  return (
    `Reminder undone 🗑️\n` +
    `Previously scheduled for: ${scheduleLabel} (GMT+7)\n\n` +
    `${entry.reminderText}`
  );
}

export function formatUndoNoReminders(): string {
  return `Nothing to undo.\n` + `You don't have any active reminders I can remove right now.`;
}

export function formatUndoTooLate(entry: ReminderListRow, timezoneOffsetMinutes: number): string {
  const undoWindowMinutes = REMIND_UNDO_WINDOW_MS / 60_000;
  const scheduleLabel = toLocalDateTimeLabel(entry.scheduledAt, timezoneOffsetMinutes);
  return (
    `I can't undo that one anymore ⏳\n` +
    `Undo is only available within ${undoWindowMinutes} minutes of creating a reminder.\n\n` +
    `Last active reminder:\n` +
    `[${scheduleLabel}] ${entry.reminderText}`
  );
}

import { debug } from '../../logger.js';
import { REMIND_LIST_LIMIT } from '../../config/env.js';
import { resolveDateInput, toScheduledUtcIso } from './remindParser.js';
import type { ParsedReminderCommand } from './remindParser.js';
import type { RemindRepository, ReminderListRow } from './infra/remindRepository.js';
import { ok, err } from '../../shared/result.js';
import type { Result } from '../../shared/result.js';

const REMINDER_ACTIVE_LIMIT = 50;

export type ReminderCreated = { scheduledAt: string; reminderText: string };
export type ReminderError = { reason: 'past_time' | 'active_limit'; activeCount?: number };
export type CreateReminderResult = Result<ReminderCreated, ReminderError>;

export type ReminderListResult = {
  rows: ReminderListRow[];
  total: number;
  page: number;
  totalPages: number;
};

export class RemindService {
  constructor(private readonly remindRepository: RemindRepository) {}

  async createReminder(
    sender: string,
    replyChatId: string,
    isGroupChat: boolean,
    parsed: ParsedReminderCommand,
    timezoneOffsetMinutes: number,
    now: Date
  ): Promise<CreateReminderResult> {
    const dateResult = resolveDateInput(parsed.dateInput, now, timezoneOffsetMinutes);
    if (!dateResult.ok) {
      return err({ reason: 'past_time' });
    }

    const scheduledAt = toScheduledUtcIso(
      dateResult.value.year,
      dateResult.value.month,
      dateResult.value.day,
      parsed.hour,
      parsed.minute,
      timezoneOffsetMinutes
    );

    if (new Date(scheduledAt).getTime() <= now.getTime()) {
      return err({ reason: 'past_time' });
    }

    const activeReminderCount = await this.remindRepository.countActiveByUser(sender);
    if (activeReminderCount >= REMINDER_ACTIVE_LIMIT) {
      return err({ reason: 'active_limit', activeCount: activeReminderCount });
    }

    await this.remindRepository.insertReminder({
      userId: sender,
      targetChatId: replyChatId,
      sourceType: isGroupChat ? 'group' : 'direct',
      reminderText: parsed.reminderText,
      scheduledAt,
      createdAt: now.toISOString(),
    });

    debug(
      `⏰ Reminder created by ${sender} for ${scheduledAt} (chat=${replyChatId}, source=${isGroupChat ? 'group' : 'direct'})`
    );

    return ok({ scheduledAt, reminderText: parsed.reminderText });
  }

  async listReminders(sender: string, page: number): Promise<ReminderListResult> {
    const total = await this.remindRepository.countByUser(sender);
    const totalPages = Math.max(1, Math.ceil(total / REMIND_LIST_LIMIT));
    const offset = (page - 1) * REMIND_LIST_LIMIT;

    const rows =
      total === 0 || page > totalPages
        ? []
        : await this.remindRepository.listByUser(sender, REMIND_LIST_LIMIT, offset);

    return { rows, total, page, totalPages };
  }
}

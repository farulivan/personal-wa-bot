import { debug } from '../../logger.js';
import { resolveDateInput, toScheduledUtcIso } from './remindParser.js';
import type { ParsedReminderCommand } from './remindParser.js';
import type { RemindRepository, ReminderListRow } from './infra/remindRepository.js';
import { ok, err } from '../../shared/result.js';
import type { Result } from '../../shared/result.js';

export const REMIND_UNDO_WINDOW_MS = 5 * 60 * 1000;

export type ReminderCreated = { scheduledAt: string; reminderText: string };
export type ReminderError = { reason: 'past_time' | 'active_limit'; activeCount?: number };
export type CreateReminderResult = Result<ReminderCreated, ReminderError>;

export type ReminderListResult = {
  rows: ReminderListRow[];
  total: number;
  page: number;
  totalPages: number;
};

export type UndoReminderResult =
  | { undone: true; entry: ReminderListRow }
  | { undone: false; reason: 'no_reminders' }
  | { undone: false; reason: 'too_late'; entry: ReminderListRow };

export class RemindService {
  constructor(
    private readonly remindRepository: RemindRepository,
    private readonly remindListLimit: number = 10,
    private readonly remindActiveLimit: number = 50
  ) {}

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
    if (activeReminderCount >= this.remindActiveLimit) {
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
    const totalPages = Math.max(1, Math.ceil(total / this.remindListLimit));
    const offset = (page - 1) * this.remindListLimit;

    const rows =
      total === 0 || page > totalPages
        ? []
        : await this.remindRepository.listByUser(sender, this.remindListLimit, offset);

    return { rows, total, page, totalPages };
  }

  async undoLastReminder(sender: string, now: Date): Promise<UndoReminderResult> {
    const last = await this.remindRepository.findLastActiveByUser(sender);
    if (!last) {
      return { undone: false, reason: 'no_reminders' };
    }

    const elapsed = now.getTime() - new Date(last.createdAt).getTime();
    if (elapsed > REMIND_UNDO_WINDOW_MS) {
      return { undone: false, reason: 'too_late', entry: last };
    }

    await this.remindRepository.softDeleteById(last.id, now.toISOString());

    debug(`⏰ Reminder undone: id=${last.id}, user=${sender}, createdAt=${last.createdAt}`);

    return { undone: true, entry: last };
  }
}

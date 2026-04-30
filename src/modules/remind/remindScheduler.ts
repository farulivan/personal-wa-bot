import { debug, error } from '../../logger.js';
import type { RemindRepository } from './infra/remindRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import { toLocalDateTimeLabel, formatSchedulerReminderMessage } from './remindPresenter.js';

type ReminderClientLike = {
  sendMessage: (chatId: string, text: string) => Promise<unknown>;
};

type StartReminderSchedulerDeps = {
  client: ReminderClientLike;
  remindRepository: RemindRepository;
  userRepository: UserRepository;
  timezoneOffsetMinutes: number;
  intervalMs?: number;
};

export type ReminderSchedulerHandle = { stop: () => void };

export function startReminderScheduler(deps: StartReminderSchedulerDeps): ReminderSchedulerHandle {
  const intervalMs = deps.intervalMs ?? 30000;
  let isRunning = false;

  const runTick = async (): Promise<void> => {
    if (isRunning) {
      return;
    }

    isRunning = true;

    try {
      const nowIso = new Date().toISOString();
      const dueReminders = await deps.remindRepository.listDuePending(nowIso, 50);

      if (dueReminders.length === 0) {
        return;
      }

      debug(`⏰ Reminder scheduler: found ${dueReminders.length} due reminder(s)`);

      const namesById = await deps.userRepository.getDisplayNamesByIds(
        dueReminders.map((r) => r.userId)
      );

      for (const reminder of dueReminders) {
        const name = namesById.get(reminder.userId) ?? reminder.userId;
        const localDateTimeLabel = toLocalDateTimeLabel(
          reminder.scheduledAt,
          deps.timezoneOffsetMinutes
        );
        const message = formatSchedulerReminderMessage(
          name,
          reminder.reminderText,
          localDateTimeLabel
        );

        try {
          await deps.client.sendMessage(reminder.targetChatId, message);
          await deps.remindRepository.markAsSent(reminder.id, new Date().toISOString());
          debug(`⏰ Reminder sent: id=${reminder.id}, chat=${reminder.targetChatId}`);
        } catch (err) {
          error(`⏰ Failed to send reminder id=${reminder.id}:`, err);
        }
      }
    } catch (err) {
      error('⏰ Reminder scheduler tick failed:', err);
    } finally {
      isRunning = false;
    }
  };

  void runTick();
  const handle = setInterval(() => {
    void runTick();
  }, intervalMs);

  return { stop: () => clearInterval(handle) };
}

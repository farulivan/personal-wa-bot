import { debug, error } from '../../logger.js';
import type { RemindRepository } from './infra/remindRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';

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

function buildReminderMessage(
  name: string,
  reminderText: string,
  localDateTimeLabel: string
): string {
  return (
    `Reminder for ${name} ⏰\n` +
    `Schedule: ${localDateTimeLabel} (GMT+7)\n\n` +
    `${reminderText}\n\n` +
    `Hope this helps you stay on track.`
  );
}

export function startReminderScheduler(deps: StartReminderSchedulerDeps): void {
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

      for (const reminder of dueReminders) {
        const name = await deps.userRepository.getDisplayName(reminder.userId);
        const localDateTimeLabel = toLocalDateTimeLabel(
          reminder.scheduledAt,
          deps.timezoneOffsetMinutes
        );
        const message = buildReminderMessage(name, reminder.reminderText, localDateTimeLabel);

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
  setInterval(() => {
    void runTick();
  }, intervalMs);
}

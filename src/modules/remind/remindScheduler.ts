import { debug, error } from '../../logger.js';
import type { RemindRepository } from './infra/remindRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import { toLocalDateTimeLabel, formatSchedulerReminderMessage } from './remindPresenter.js';

type ReminderClientLike = {
  sendMessage: (chatId: string, text: string, mentionNumbers?: string[]) => Promise<unknown>;
};

type StartReminderSchedulerDeps = {
  client: ReminderClientLike;
  remindRepository: RemindRepository;
  userRepository: UserRepository;
  timezoneOffsetMinutes: number;
  intervalMs?: number;
  /** Defaults to always-connected so tests and callers can leave it out. */
  isConnected?: () => boolean;
};

export type ReminderSchedulerHandle = { stop: () => void };

export function startReminderScheduler(deps: StartReminderSchedulerDeps): ReminderSchedulerHandle {
  const intervalMs = deps.intervalMs ?? 30000;
  let isRunning = false;

  const runTick = async (): Promise<void> => {
    if (isRunning) {
      return;
    }

    // Claiming stamps sent_at before the send and we never retry (ADR 0001),
    // so claiming while the socket is down silently destroys the reminder.
    if (deps.isConnected && !deps.isConnected()) {
      debug('⏰ Reminder scheduler: skipping tick, whatsapp is not connected');
      return;
    }

    isRunning = true;

    try {
      const nowIso = new Date().toISOString();
      const dueReminders = await deps.remindRepository.claimDueReminders(nowIso, 50);

      if (dueReminders.length === 0) {
        return;
      }

      debug(`⏰ Reminder scheduler: claimed ${dueReminders.length} due reminder(s)`);

      const userIds = dueReminders.map((r) => r.userId);
      const [namesById, phonesById] = await Promise.all([
        deps.userRepository.getDisplayNamesByIds(userIds),
        deps.userRepository.getPhoneNumbersByIds(userIds),
      ]);

      for (const reminder of dueReminders) {
        const name = namesById.get(reminder.userId) ?? reminder.userId;
        const phoneNumber = phonesById.get(reminder.userId) ?? null;
        const localDateTimeLabel = toLocalDateTimeLabel(
          reminder.scheduledAt,
          deps.timezoneOffsetMinutes
        );
        const isGroupChat = reminder.sourceType === 'group';
        const result = formatSchedulerReminderMessage(
          phoneNumber,
          name,
          reminder.reminderText,
          localDateTimeLabel,
          isGroupChat
        );

        try {
          await deps.client.sendMessage(reminder.targetChatId, result.text, result.mentions);
          debug(`⏰ Reminder sent: id=${reminder.id}, chat=${reminder.targetChatId}`);
        } catch (err) {
          error(
            `⏰ Failed to send reminder id=${reminder.id} (already claimed; will not retry):`,
            err
          );
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

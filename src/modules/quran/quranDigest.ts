import { debug, error } from '../../logger.js';
import { formatReminderMessage } from './quranPresenter.js';
import type { QuranService } from './quranService.js';
import type { GroupMembershipPort, MessageSenderPort } from '../../adapters/whatsapp/ports.js';

type QuranReminderDeps = {
  membershipPort: GroupMembershipPort;
  senderPort: MessageSenderPort;
  quranService: QuranService;
  timezoneOffsetMinutes: number;
};

export function createQuranReminderSender(deps: QuranReminderDeps) {
  return async function sendQuranReminder(groupChatId: string): Promise<void> {
    const now = new Date();
    debug(
      `📖 Quran reminder starting at ${now.toISOString()} (UTC), timezoneOffset=${deps.timezoneOffsetMinutes}min`
    );

    let reminders;
    try {
      reminders = await deps.quranService.getReminderTargets(
        deps.membershipPort,
        groupChatId,
        deps.timezoneOffsetMinutes,
        now
      );
    } catch (err) {
      error(`📖 Failed to load group members for ${groupChatId}:`, err);
      return;
    }

    if (reminders.length === 0) {
      debug('📖 Quran reminder: no group participants found, skipping');
      return;
    }

    const message = formatReminderMessage(reminders);
    debug(`📖 Reminder message built, sending to ${groupChatId}`);

    try {
      await deps.senderPort.sendMessage(groupChatId, message);
      debug(`📖 Quran reminder sent to ${groupChatId}`);
    } catch (err) {
      error('📖 Failed to send Quran reminder:', err);
    }
  };
}

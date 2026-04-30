import { debug, error } from '../../logger.js';
import { formatReminderMessage, formatMonthlyQuranDigestMessage } from './quranPresenter.js';
import type { UserReminder } from './quranPresenter.js';
import type { QuranService } from './quranService.js';
import type { GroupMembershipPort, MessageSenderPort } from '../../adapters/whatsapp/ports.js';
import { resolveGroupDbUserIds } from '../../adapters/whatsapp/resolveGroupDbUserIds.js';

type QuranReminderDeps = {
  membershipPort: GroupMembershipPort;
  senderPort: MessageSenderPort;
  quranService: QuranService;
  timezoneOffsetMinutes: number;
};

type QuranMonthlyDigestDeps = {
  senderPort: MessageSenderPort;
  quranService: QuranService;
  timezoneOffsetMinutes: number;
};

export function createMonthlyQuranDigestSender(deps: QuranMonthlyDigestDeps) {
  return async function sendMonthlyQuranDigest(groupChatId: string): Promise<void> {
    const now = new Date();

    let entries: Awaited<ReturnType<QuranService['getLastMonthLeaderboard']>>['entries'];
    let monthLabel: string;
    try {
      const result = await deps.quranService.getLastMonthLeaderboard(
        deps.timezoneOffsetMinutes,
        now
      );
      entries = result.entries;
      monthLabel = result.monthLabel;
    } catch (err) {
      error(`📅 Failed to load monthly Quran leaderboard for ${groupChatId}:`, err);
      return;
    }

    const ranked = [...entries].sort(
      (a, b) =>
        b.currentStreak - a.currentStreak ||
        b.bestStreak - a.bestStreak ||
        b.pagesRead - a.pagesRead ||
        a.user.localeCompare(b.user)
    );

    const message = formatMonthlyQuranDigestMessage(ranked, monthLabel);

    try {
      await deps.senderPort.sendMessage(groupChatId, message);
      debug(`📅 Monthly Quran digest sent to ${groupChatId}`);
    } catch (err) {
      error('📅 Failed to send monthly Quran digest:', err);
    }
  };
}

export function createQuranReminderSender(deps: QuranReminderDeps) {
  return async function sendQuranReminder(groupChatId: string): Promise<void> {
    const now = new Date();
    debug(
      `📖 Quran reminder starting at ${now.toISOString()} (UTC), timezoneOffset=${deps.timezoneOffsetMinutes}min`
    );

    let reminders: UserReminder[];
    try {
      const dbUsers = await deps.quranService.listDistinctUsers();
      const targets = await resolveGroupDbUserIds(deps.membershipPort, groupChatId, dbUsers);

      debug(`📖 Found ${targets.length} reminder targets from group participants`);

      reminders = await Promise.all(
        targets.map(async (userId) => {
          const data = await deps.quranService.getReminderDataForUser(
            userId,
            deps.timezoneOffsetMinutes,
            now
          );
          return { name: data.name, hasRead: data.hasRead, currentStreak: data.currentStreak };
        })
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

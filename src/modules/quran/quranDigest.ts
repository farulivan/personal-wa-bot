import { debug, error } from '../../logger.js';
import {
  listGroupMemberIdentities,
  resolveNormalizedBotUserId,
  type BotInfoClientLike,
  type GroupMemberClientLike,
  type GroupMemberIdentity,
} from '../../adapters/whatsapp/waId.js';
import type { QuranRepository } from './infra/quranRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import { computeQuranStreaks } from './quranStreaks.js';

type WhatsAppClientLike = {
  sendMessage: (chatId: string, text: string) => Promise<unknown>;
} & GroupMemberClientLike &
  BotInfoClientLike;

type QuranReminderDeps = {
  client: WhatsAppClientLike;
  quranRepository: QuranRepository;
  userRepository: UserRepository;
  timezoneOffsetMinutes: number;
};

type UserReminder = {
  name: string;
  hasRead: boolean;
  currentStreak: number;
};

function joinHumanNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} dan ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, dan ${names[names.length - 1]}`;
}

function buildReminderMessage(reminders: UserReminder[]): string {
  if (reminders.length === 0) {
    return `Pengingat tilawah 22:00 🌙\n\nBelum ada data #quran di grup ini. Yuk mulai dengan:\n#quran read 1`;
  }

  const readToday = reminders.filter((user) => user.hasRead);
  const notReadYet = reminders.filter((user) => !user.hasRead);
  const notReadWithStreak = reminders.filter((user) => !user.hasRead && user.currentStreak > 0);
  const notReadNoStreak = reminders.filter((user) => !user.hasRead && user.currentStreak <= 0);

  const sections: string[] = [];

  if (readToday.length > 0) {
    sections.push(
      `✅ MasyaAllah, ${joinHumanNames(readToday.map((user) => user.name))} sudah tilawah hari ini.` +
        `\nKalau masih ada waktu malam ini, boleh ditambah lagi biar makin berkah 📖✨`
    );
  }

  if (notReadWithStreak.length > 0) {
    sections.push(
      `🔥 ${joinHumanNames(notReadWithStreak.map((user) => user.name))} kemarin sudah baca, tapi hari ini belum.` +
        `\nJangan sampai streak putus malam ini ya 🤲`
    );
  }

  if (notReadNoStreak.length > 0) {
    sections.push(
      `🌱 ${joinHumanNames(notReadNoStreak.map((user) => user.name))} masih belum mulai dari kemarin.` +
        `\nYuk buka 1-2 halaman dulu malam ini, pelan-pelan yang penting jalan ✨`
    );
  }

  if (notReadYet.length === 0) {
    return (
      `MasyaAllah tabarakallah 🤲\n\n` +
      `${sections.join('\n\n')}\n\n` +
      `Semoga Allah jaga istiqamah kita semua 📖✨`
    );
  }

  return (
    `Pengingat tilawah 22:00 🌙\n` +
    `Masih ada 2 jam sebelum lose streak (00:00 GMT+7).\n\n` +
    `${sections.join('\n\n')}\n\n` +
    `Gas baca dulu, lalu catat dengan #quran read 📖`
  );
}

export function createQuranReminderSender(deps: QuranReminderDeps) {
  return async function sendQuranReminder(groupChatId: string): Promise<void> {
    const now = new Date();
    debug(
      `📖 Quran reminder starting at ${now.toISOString()} (UTC), timezoneOffset=${deps.timezoneOffsetMinutes}min`
    );

    let groupMemberIdentities: GroupMemberIdentity[];
    let knownUsers: Set<string>;

    try {
      const [memberIdentities, botUserId, dbUsers] = await Promise.all([
        listGroupMemberIdentities(deps.client, groupChatId),
        resolveNormalizedBotUserId(deps.client),
        deps.quranRepository.listDistinctUsers(),
      ]);

      groupMemberIdentities = botUserId
        ? memberIdentities.filter((member) => !member.aliases.includes(botUserId))
        : memberIdentities;
      knownUsers = new Set(dbUsers);
    } catch (err) {
      error(`📖 Failed to load group members for ${groupChatId}:`, err);
      return;
    }

    const targetUserIds = new Set<string>();

    // Source-of-truth for reminder targets is current group participants.
    // For each participant, map to DB user ID when an alias match exists.
    for (const member of groupMemberIdentities) {
      const matchedDbId = member.aliases.find((alias: string) => knownUsers.has(alias));
      const dbUserId = matchedDbId ?? member.primaryId;
      targetUserIds.add(dbUserId);
    }

    const targets = Array.from(targetUserIds);

    debug(`📖 Found ${targets.length} reminder targets from group participants`);

    if (targets.length === 0) {
      debug('📖 Quran reminder: no group participants found, skipping');
      return;
    }

    const reminders: UserReminder[] = await Promise.all(
      targets.map(async (userId) => {
        const [hasRead, readDays, name] = await Promise.all([
          deps.quranRepository.hasReadTodayByUser(
            userId,
            deps.timezoneOffsetMinutes,
            now.toISOString()
          ),
          deps.quranRepository.getReadDays(userId, deps.timezoneOffsetMinutes),
          deps.userRepository.getDisplayName(userId),
        ]);
        const streaks = computeQuranStreaks(readDays, deps.timezoneOffsetMinutes, now);

        return { name, hasRead, currentStreak: streaks.current };
      })
    );

    const message = buildReminderMessage(reminders);
    debug(`📖 Reminder message built, sending to ${groupChatId}`);

    try {
      await deps.client.sendMessage(groupChatId, message);
      debug(`📖 Quran reminder sent to ${groupChatId}`);
    } catch (err) {
      error('📖 Failed to send Quran reminder:', err);
    }
  };
}

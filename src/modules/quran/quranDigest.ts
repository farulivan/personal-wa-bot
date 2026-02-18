import type { Database } from 'better-sqlite3';
import { debug, error } from '../../logger.js';
import {
  listGroupMemberIdentities,
  resolveNormalizedBotUserId,
  type BotInfoClientLike,
  type GroupMemberIdentity,
  type GroupMemberClientLike,
} from '../../adapters/whatsapp/waId.js';
import type { QuranRepository } from './infra/quranRepository.js';
import { computeQuranStreaks } from './quranStreaks.js';

type ContactLike = {
  pushname?: string;
  name?: string;
  shortName?: string;
  number?: string;
};

type WhatsAppClientLike = {
  getContactById: (contactId: string) => Promise<ContactLike>;
  sendMessage: (chatId: string, text: string) => Promise<unknown>;
} & GroupMemberClientLike &
  BotInfoClientLike;

type QuranReminderDeps = {
  client: WhatsAppClientLike;
  db: Database;
  quranRepository: QuranRepository;
  timezoneOffsetMinutes: number;
};

type UserReminder = {
  name: string;
  hasRead: boolean;
  currentStreak: number;
};

type ReminderTarget = {
  contactLookupId: string;
  dbUserId: string;
};

function toDisplayName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function joinHumanNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} dan ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, dan ${names[names.length - 1]}`;
}

function isValidStr(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value !== 'undefined';
}

async function resolveUserName(client: WhatsAppClientLike, sender: string): Promise<string> {
  const fallback = sender.replace(/@.*$/, '');
  const contactIds = sender.includes('@') ? [sender] : [`${sender}@c.us`, `${sender}@lid`];

  for (const contactId of contactIds) {
    try {
      const contact = await client.getContactById(contactId);
      if (isValidStr(contact.pushname)) return contact.pushname;
      if (isValidStr(contact.name)) return contact.name;
      if (isValidStr(contact.shortName)) return contact.shortName;
      if (isValidStr(contact.number)) return contact.number;
    } catch {
      // continue fallback attempts silently
    }
  }

  return fallback;
}

function buildReminderMessage(reminders: UserReminder[]): string {
  if (reminders.length === 0) {
    return `Pengingat tilawah 22:00 🌙\n\nBelum ada data #quran di grup ini. Yuk mulai dengan:\n#quran read 1`;
  }

  const withDisplayNames = reminders.map((user) => ({
    ...user,
    displayName: toDisplayName(user.name),
  }));

  const readToday = withDisplayNames.filter((user) => user.hasRead);
  const notReadYet = reminders.filter((user) => !user.hasRead);
  const notReadWithStreak = withDisplayNames.filter(
    (user) => !user.hasRead && user.currentStreak > 0
  );
  const notReadNoStreak = withDisplayNames.filter(
    (user) => !user.hasRead && user.currentStreak <= 0
  );

  const sections: string[] = [];

  if (readToday.length > 0) {
    sections.push(
      `✅ MasyaAllah, ${joinHumanNames(readToday.map((user) => user.displayName))} sudah tilawah hari ini.` +
        `\nKalau masih ada waktu malam ini, boleh ditambah lagi biar makin berkah 📖✨`
    );
  }

  if (notReadWithStreak.length > 0) {
    sections.push(
      `🔥 ${joinHumanNames(notReadWithStreak.map((user) => user.displayName))} kemarin sudah baca, tapi hari ini belum.` +
        `\nJangan sampai streak putus malam ini ya 🤲`
    );
  }

  if (notReadNoStreak.length > 0) {
    sections.push(
      `🌱 ${joinHumanNames(notReadNoStreak.map((user) => user.displayName))} masih belum mulai dari kemarin.` +
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
        Promise.resolve(deps.quranRepository.listDistinctUsers()),
      ]);

      groupMemberIdentities = botUserId
        ? memberIdentities.filter((member) => !member.aliases.includes(botUserId))
        : memberIdentities;
      knownUsers = new Set(dbUsers);
    } catch (err) {
      error(`📖 Failed to load group members for ${groupChatId}:`, err);
      return;
    }

    const targetsByDbUserId = new Map<string, ReminderTarget>();

    // Source-of-truth for reminder targets is current group participants.
    // For each participant, map to DB user ID when an alias match exists.
    for (const member of groupMemberIdentities) {
      const matchedDbId = member.aliases.find((alias) => knownUsers.has(alias));
      const dbUserId = matchedDbId ?? member.primaryId;

      if (!targetsByDbUserId.has(dbUserId)) {
        targetsByDbUserId.set(dbUserId, {
          contactLookupId: member.primaryId,
          dbUserId,
        });
      }
    }

    const targets = Array.from(targetsByDbUserId.values());

    debug(`📖 Found ${targets.length} reminder targets from group participants`);

    if (targets.length === 0) {
      debug('📖 Quran reminder: no group participants found, skipping');
      return;
    }

    const reminders: UserReminder[] = [];

    for (const target of targets) {
      const name = await resolveUserName(deps.client, target.contactLookupId);

      const hasRead = deps.quranRepository.hasReadTodayByUser(
        target.dbUserId,
        deps.timezoneOffsetMinutes,
        now.toISOString()
      );
      const streaks = computeQuranStreaks(
        deps.db,
        target.dbUserId,
        deps.timezoneOffsetMinutes,
        now
      );

      reminders.push({
        name,
        hasRead,
        currentStreak: streaks.current,
      });
    }

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

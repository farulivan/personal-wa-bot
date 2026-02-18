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
    } catch (err) {
      debug(`📖 Quran reminder contact lookup failed for ${contactId}:`, err);
    }
  }

  return fallback;
}

function buildReminderMessage(reminders: UserReminder[]): string {
  if (reminders.length === 0) {
    return `Pengingat tilawah 22:00 🌙\n\nBelum ada data #quran di grup ini. Yuk mulai dengan:\n#quran read 1`;
  }

  const notReadYet = reminders.filter((user) => !user.hasRead);
  if (notReadYet.length === 0) {
    return (
      `MasyaAllah tabarakallah 🤲\n\n` +
      `Semua yang tercatat sudah tilawah hari ini.\n` +
      `Semoga Allah jaga istiqamah kita semua 📖✨`
    );
  }

  const lines = notReadYet.map((user) => {
    if (user.currentStreak > 0) {
      return `• ${user.name} — streak ${user.currentStreak} hari masih on fire 🔥 (jangan putus malam ini)`;
    }

    return `• ${user.name} — belum mulai hari ini, yuk buka 1-2 halaman dulu ✨`;
  });

  return (
    `Pengingat tilawah 22:00 🌙\n` +
    `Masih ada 2 jam sebelum reset hari (00:00 GMT+7).\n\n` +
    `${lines.join('\n')}\n\n` +
    `Gas baca dulu, lalu catat dengan #quran read <jumlah_halaman> 📖`
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

    const contactLookupByAlias = new Map<string, string>();
    for (const member of groupMemberIdentities) {
      for (const alias of member.aliases) {
        if (!contactLookupByAlias.has(alias)) {
          contactLookupByAlias.set(alias, member.primaryId);
        }
      }
    }

    const targetsByDbUserId = new Map<string, ReminderTarget>();

    // Source-of-truth for streak/read is DB users (same principle as workout digest).
    for (const dbUserId of knownUsers) {
      const contactLookupId = contactLookupByAlias.get(dbUserId) ?? dbUserId;
      targetsByDbUserId.set(dbUserId, {
        contactLookupId,
        dbUserId,
      });
    }

    // Keep participants with no DB record so reminder still nudges newcomers.
    for (const member of groupMemberIdentities) {
      const matchedDbId = member.aliases.find((alias) => knownUsers.has(alias));
      if (matchedDbId) continue;

      if (!targetsByDbUserId.has(member.primaryId)) {
        targetsByDbUserId.set(member.primaryId, {
          contactLookupId: member.primaryId,
          dbUserId: member.primaryId,
        });
      }
    }

    const targets = Array.from(targetsByDbUserId.values());

    debug(
      `📖 Found ${targets.length} reminder targets from group participants: ${targets
        .map((target) => `${target.contactLookupId}=>${target.dbUserId}`)
        .join(', ')}`
    );

    if (targets.length === 0) {
      debug('📖 Quran reminder: no group participants found, skipping');
      return;
    }

    const reminders: UserReminder[] = [];

    for (const target of targets) {
      const name = await resolveUserName(deps.client, target.contactLookupId);
      debug(
        `📖 Checking user: contactLookupId=${target.contactLookupId}, dbUserId=${target.dbUserId} (${name})`
      );

      const hasRead = deps.quranRepository.hasReadTodayByUser(
        target.dbUserId,
        deps.timezoneOffsetMinutes,
        now.toISOString()
      );
      const streaks = computeQuranStreaks(deps.db, target.dbUserId, deps.timezoneOffsetMinutes, now);

      debug(`📖 User ${name}: hasRead=${hasRead}, currentStreak=${streaks.current}`);

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

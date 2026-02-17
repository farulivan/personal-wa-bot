import type { Database } from 'better-sqlite3';
import { debug, error } from '../../logger.js';
import type { QuranRepository } from './infra/quranRepository.js';
import { computeQuranStreaks, hasReadToday } from './quranStreaks.js';

type ContactLike = {
  pushname?: string;
  name?: string;
  shortName?: string;
  number?: string;
};

type GroupParticipantLike = {
  id?: {
    _serialized?: string;
  };
};

type GroupChatLike = {
  participants?: GroupParticipantLike[];
};

type WhatsAppClientLike = {
  getContactById: (contactId: string) => Promise<ContactLike>;
  getChatById: (chatId: string) => Promise<unknown>;
  sendMessage: (chatId: string, text: string) => Promise<unknown>;
};

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

function isValidStr(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value !== 'undefined';
}

async function resolveUserName(client: WhatsAppClientLike, sender: string): Promise<string> {
  const fallback = sender.replace(/@.*$/, '');
  const contactId = sender.includes('@') ? sender : `${sender}@c.us`;

  try {
    const contact = await client.getContactById(contactId);
    if (isValidStr(contact.pushname)) return contact.pushname;
    if (isValidStr(contact.name)) return contact.name;
    if (isValidStr(contact.shortName)) return contact.shortName;
    if (isValidStr(contact.number)) return contact.number;
  } catch (err) {
    debug(`📖 Quran reminder contact lookup failed for ${contactId}:`, err);
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

function toGroupChatLike(value: unknown): GroupChatLike {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const maybeParticipants = (value as { participants?: unknown }).participants;
  if (!Array.isArray(maybeParticipants)) {
    return {};
  }

  return {
    participants: maybeParticipants as GroupParticipantLike[],
  };
}

async function getReminderTargets(deps: QuranReminderDeps, groupChatId: string): Promise<string[]> {
  try {
    const chat = toGroupChatLike(await deps.client.getChatById(groupChatId));
    const participants = Array.isArray(chat.participants) ? chat.participants : [];

    const participantIds = participants
      .map((participant) => participant.id?._serialized || '')
      .filter((sender) => sender.endsWith('@c.us'));

    if (participantIds.length > 0) {
      return participantIds;
    }
  } catch (err) {
    debug(`📖 Quran reminder participant lookup failed for ${groupChatId}:`, err);
  }

  return deps.quranRepository.listDistinctUsers();
}

export function createQuranReminderSender(deps: QuranReminderDeps) {
  return async function sendQuranReminder(groupChatId: string): Promise<void> {
    const now = new Date();
    debug(`📖 Quran reminder starting at ${now.toISOString()} (UTC), timezoneOffset=${deps.timezoneOffsetMinutes}min`);
    
    const users = await getReminderTargets(deps, groupChatId);
    debug(`📖 Found ${users.length} reminder targets: ${users.join(', ')}`);

    if (users.length === 0) {
      debug('📖 Quran reminder: no quran users in DB, skipping');
      return;
    }

    const reminders: UserReminder[] = [];

    for (const sender of users) {
      const name = await resolveUserName(deps.client, sender);
      debug(`📖 Checking user: ${sender} (${name})`);
      
      const hasRead = hasReadToday(deps.db, sender, deps.timezoneOffsetMinutes, now);
      const streaks = computeQuranStreaks(deps.db, sender, deps.timezoneOffsetMinutes, now);

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

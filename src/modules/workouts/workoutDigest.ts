import { computeStreaks } from './workoutStreaks.js';
import { debug, error } from '../../logger.js';
import type { Database } from 'better-sqlite3';
import type { WorkoutRepository } from './infra/workoutRepository.js';
import {
  listGroupMemberIdentities,
  resolveNormalizedBotUserId,
  type BotInfoClientLike,
  type GroupMemberClientLike,
} from '../../adapters/whatsapp/waId.js';

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

type DigestDeps = {
  client: WhatsAppClientLike;
  db: Database;
  workoutRepository: WorkoutRepository;
  timezoneOffsetMinutes: number;
};

type UserStreak = {
  name: string;
  current: number;
  best: number;
};

type DigestTarget = {
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

function isValidStr(val: unknown): val is string {
  return typeof val === 'string' && val !== '' && val !== 'undefined';
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
      // Continue with next contact ID candidate.
    }
  }

  return fallback;
}

function buildStandingsMessage(standings: UserStreak[]): string {
  if (standings.length === 0) {
    return (
      `Morning team 👋\n\n` +
      `No active streaks right now.\n` +
      `Today's a good day to start one.\n\n` +
      `3 workouts = 1 streak day. Simple.\n\n` +
      `Let's get after it 💪`
    );
  }

  // Sort by current streak descending, then best descending
  const sorted = [...standings].sort((a, b) => b.current - a.current || b.best - a.best);

  const hasActiveStreaks = sorted.some((s) => s.current > 0);

  const lines = sorted.map((s, i) => {
    const rank = i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🔹';
    const streakStr =
      s.current > 0 ? `${s.current} day${s.current !== 1 ? 's' : ''}` : 'no active streak';
    const bestStr = s.best > 0 ? ` (best: ${s.best})` : '';
    return `${medal} ${s.name} — ${streakStr}${bestStr}`;
  });

  const header = hasActiveStreaks
    ? `Morning check-in 🔥\n\nStreak standings:`
    : `Morning check-in 👋\n\nHere's where everyone's at:`;

  const footer = hasActiveStreaks
    ? `\n\nKeep showing up. Consistency wins. 💪`
    : `\n\nNo active streaks today.\nWho's gonna start one? 💪`;

  return `${header}\n\n${lines.join('\n')}${footer}`;
}

export function createDailyStreakDigestSender(deps: DigestDeps) {
  return async function sendDailyStreakDigest(groupChatId: string): Promise<void> {
    const now = new Date();

    let targets: DigestTarget[];

    try {
      const [memberIdentities, botUserId, dbUsers] = await Promise.all([
        listGroupMemberIdentities(deps.client, groupChatId),
        resolveNormalizedBotUserId(deps.client),
        Promise.resolve(deps.workoutRepository.listDistinctUsers()),
      ]);

      const groupMemberIdentities = botUserId
        ? memberIdentities.filter((member) => !member.aliases.includes(botUserId))
        : memberIdentities;

      const knownUsers = new Set(dbUsers);
      const targetsByDbUserId = new Map<string, DigestTarget>();

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

      targets = Array.from(targetsByDbUserId.values());
    } catch (err) {
      error(`⏰ Failed to load group participants for digest ${groupChatId}:`, err);
      return;
    }

    if (targets.length === 0) {
      debug('⏰ Digest: no valid group participants, skipping');
      return;
    }

    const standings: UserStreak[] = [];

    for (const target of targets) {
      const streaks = computeStreaks(deps.db, target.dbUserId, deps.timezoneOffsetMinutes, now);
      const rawName = await resolveUserName(deps.client, target.contactLookupId);
      const name = toDisplayName(rawName);
      standings.push({ name, current: streaks.current, best: streaks.best });
    }

    const message = buildStandingsMessage(standings);

    try {
      await deps.client.sendMessage(groupChatId, message);
      debug(`⏰ Digest sent to ${groupChatId}`);
    } catch (err) {
      error('⏰ Failed to send digest:', err);
    }
  };
}

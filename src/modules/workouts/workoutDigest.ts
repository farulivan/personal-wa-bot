import { client } from '../../bot.js';
import { db } from '../../db.js';
import { USER_TIMEZONE_OFFSET } from '../../app/constants.js';
import { computeStreaks } from './workoutStreaks.js';
import { getDisplayName } from '../../app/userProfile.js';
import { debug, error } from '../../logger.js';

type UserStreak = {
  name: string;
  current: number;
  best: number;
};

function isValidStr(val: unknown): val is string {
  return typeof val === 'string' && val !== '' && val !== 'undefined';
}

async function resolveUserName(sender: string): Promise<string> {
  const fallback = sender.replace(/@.*$/, '');

  // 1. Check cached name from DB (populated on every user interaction)
  const cached = getDisplayName(db, sender);
  if (cached) {
    debug(`⏰ Name from cache: ${sender} → "${cached}"`);
    return cached;
  }

  // 2. Try getContactById as fallback (works for @c.us, may fail for @lid)
  const contactId = sender.includes('@') ? sender : `${sender}@c.us`;
  try {
    const contact = await client.getContactById(contactId);
    debug(
      `⏰ Contact resolved: id=${contactId}, pushname="${contact.pushname}", name="${contact.name}", shortName="${contact.shortName}", number="${contact.number}"`
    );
    if (isValidStr(contact.pushname)) return contact.pushname;
    if (isValidStr(contact.name)) return contact.name;
    if (isValidStr(contact.shortName)) return contact.shortName;
    if (isValidStr(contact.number)) return contact.number;
  } catch (err) {
    debug(`⏰ Contact resolution failed for ${contactId}:`, err);
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
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '  ';
    const streakStr =
      s.current > 0 ? `${s.current} day${s.current !== 1 ? 's' : ''}` : 'no active streak';
    const bestStr = s.best > 0 ? ` (best: ${s.best})` : '';
    return `${medal} ${s.name} — ${streakStr}${bestStr}`;
  });

  const header = hasActiveStreaks
    ? `Morning check-in 🔥\n\nStreak standings:`
    : `Morning check-in 👋\n\nHere's where everyone's at:`;

  const footer = hasActiveStreaks
    ? `\n\nKeep showing up. Consistency wins.`
    : `\n\nNo active streaks today.\nWho's gonna start one? 💪`;

  return `${header}\n\n${lines.join('\n')}${footer}`;
}

export async function sendDailyStreakDigest(groupChatId: string): Promise<void> {
  const now = new Date();

  // Query actual users from DB — guarantees sender format matches stored data
  const dbUsers = db.prepare(`SELECT DISTINCT user FROM workouts`).all() as { user: string }[];
  debug(`⏰ DB workout users: [${dbUsers.map((r) => r.user).join(', ')}]`);

  if (dbUsers.length === 0) {
    debug('⏰ Digest: no workout users in DB, skipping');
    return;
  }

  const standings: UserStreak[] = [];

  for (const { user: sender } of dbUsers) {
    debug(`⏰ Computing streaks for sender="${sender}"`);
    const streaks = computeStreaks(db, sender, USER_TIMEZONE_OFFSET, now);
    debug(`⏰ Streaks result: current=${streaks.current}, best=${streaks.best}`);
    const name = await resolveUserName(sender);
    standings.push({ name, current: streaks.current, best: streaks.best });
  }

  const message = buildStandingsMessage(standings);

  try {
    await client.sendMessage(groupChatId, message);
    debug(`⏰ Digest sent to ${groupChatId}`);
  } catch (err) {
    error('⏰ Failed to send digest:', err);
  }
}

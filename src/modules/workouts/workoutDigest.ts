import { client } from '../../bot.js';
import { db } from '../../db.js';
import { ALLOWED_NUMBERS } from '../../config.js';
import { USER_TIMEZONE_OFFSET } from '../../app/constants.js';
import { computeStreaks } from './workoutStreaks.js';
import { debug, error } from '../../logger.js';

type UserStreak = {
  name: string;
  current: number;
  best: number;
};

async function resolveUserName(number: string): Promise<string> {
  try {
    const contact = await client.getContactById(`${number}@c.us`);
    return contact.pushname || contact.name || number;
  } catch {
    return number;
  }
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
  const numbers = Array.from(ALLOWED_NUMBERS);

  if (numbers.length === 0) {
    debug('⏰ Digest: no allowed numbers configured, skipping');
    return;
  }

  const standings: UserStreak[] = [];

  for (const number of numbers) {
    const sender = `${number}@c.us`;
    const streaks = computeStreaks(db, sender, USER_TIMEZONE_OFFSET, now);
    const name = await resolveUserName(number);
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

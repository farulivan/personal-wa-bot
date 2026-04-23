import type { AppContext } from './appContext.js';

const GREETINGS = ['halo', 'hello', 'hi'];

const ALLOWED_RESPONSE = [
  `Yo! 👊`,
  `Hey 👋 Ready to track today's wins?`,
  `What's up 👊 Let's keep those streaks alive 💪`,
];

const BLOCKED_RESPONSE =
  `Hey 👋\n` +
  `Looks like you're not registered yet.\n\n` +
  `Ask the admin to add your number,\n` +
  `then you're good to go 💪`;

const HELP_TEXT =
  `I'm your daily tracker.\n` +
  `Workouts, sholat, Qur'an, and reminders — all in one chat.\n\n` +
  `*What I can do:*\n\n` +
  `💪 *Workout* — log lifts & cardio\n` +
  `• #workout lift bench press 20reps 4sets 10kg\n` +
  `• #workout cardio run 30min 5km\n` +
  `• #workout list\n\n` +
  `🕌 *Sholat* — today's prayer times\n` +
  `• #sholat --today\n` +
  `• #sholat --today --location bandung\n\n` +
  `📖 *Quran* — track pages & bookmarks\n` +
  `• #quran read 3\n` +
  `• #quran mark 145\n` +
  `• #quran list\n\n` +
  `⏰ *Remind* — schedule reminders\n` +
  `• #remind tomorrow 9am Team sync\n` +
  `• #remind 2026-03-10 10:30 Review proposal\n` +
  `• #remind list\n\n` +
  `Need details? Send *#<command> help* (e.g. #workout help)`;

export function isGreeting(text: string): boolean {
  const lower = text.toLowerCase();
  return GREETINGS.some((g) => new RegExp(`\\b${g}\\b`).test(lower));
}

export async function handleGreeting(
  sender: string,
  replyFn: (text: string) => Promise<void>,
  appContext: AppContext
): Promise<void> {
  if (appContext.isAllowedUser(sender)) {
    const opening = ALLOWED_RESPONSE[Math.floor(Math.random() * ALLOWED_RESPONSE.length)];
    await replyFn(`${opening}\n${HELP_TEXT}`);
  } else {
    await replyFn(BLOCKED_RESPONSE);
  }
}

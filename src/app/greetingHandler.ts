import type { AppContext } from './appContext.js';

const GREETINGS = ['halo', 'hello', 'hi '];

const ALLOWED_RESPONSE = [
  `Yo! 👊`,
  `What's up 👊 Ready to log a workout?`,
  `Hey. Let's put today's work on the board 💪`,
];

const BLOCKED_RESPONSE =
  `Hey 👋\n` +
  `Looks like you're not registered yet.\n\n` +
  `Ask the admin to add your number,\n` +
  `then you're good to go 💪`;

const HELP_TEXT =
  `I'm your workout tracker.\n\n` +
  `Log it. Track it. Get stronger.\n\n` +
  `*What I can do:*\n` +
  `• #workout lift ... - log lift workout\n` +
  `• #workout cardio ... - log cardio workout\n` +
  `• #workout --list - see your recent workouts\n` +
  `• #sholat --today - get today's prayer times\n` +
  `• #quran read 3 - log today's quran pages\n\n` +
  `*Examples:*\n` +
  `#workout lift bench press 20reps 4sets 10kg\n` +
  `#workout cardio run 30min 5km\n\n` +
  `(lift accepts rep/reps and set/sets; weight is optional bodyweight)`;

export function isGreeting(text: string): boolean {
  const lower = text.toLowerCase();
  return GREETINGS.some((g) => lower.includes(g));
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

import type { Message, MessageContext } from '../types/types.js';
import { client } from '../core/bot.js';
import { safeReply } from '../core/messaging.js';
import { appConfig, isAllowedUser } from '../config/app.config.js';
import { featureRegistry } from '../features/registry.js';
import { randomChoice } from '../utils/response.js';

// Build the help message dynamically from registered features
function buildHelpMessage(): string {
  const featureHelp = featureRegistry.getHelp();
  return (
    `*What I can do:*\n` +
    `${featureHelp}\n\n` +
    `*Example:*\n` +
    `#workout\n` +
    `type: bench press\n` +
    `reps: 20\n` +
    `sets: 4\n` +
    `weight: 10 (optional)\n\n` +
    `(weight is in kg, leave it blank for bodyweight)`
  );
}

// Handle greeting when bot is mentioned
async function handleGreeting(msg: Message, sender: string): Promise<void> {
  if (isAllowedUser(sender)) {
    const openings = [
      `Yo! 👊`,
      `What's up 👊 Ready to log a workout?`,
      `Hey. Let's put today's work on the board 💪`,
    ];

    const randomOpening = randomChoice(openings);
    const helpMessage = buildHelpMessage();

    await safeReply(
      msg,
      `${randomOpening}\n` +
        `I'm your workout tracker.\n\n` +
        `Log it. Track it. Get stronger.\n\n` +
        `${helpMessage}`
    );
  } else {
    await safeReply(
      msg,
      `Hey 👋\n` +
        `Looks like you're not registered yet.\n\n` +
        `Ask the admin to add your number,\n` +
        `then you're good to go 💪`
    );
  }
}

// Extract message context
async function extractContext(msg: Message): Promise<MessageContext> {
  let text = msg.body.trim();
  const textLower = text.toLowerCase();
  const isGroup = msg.from.endsWith('@g.us');
  const sender = msg.author ?? msg.from;

  // Check if bot is mentioned (for groups)
  let isBotMentioned = false;
  if (isGroup) {
    const mentions = await msg.getMentions();
    const botInfo = await client.info;
    const botNumber = botInfo?.wid?._serialized;
    isBotMentioned = mentions.some((m) => m.id._serialized === botNumber);

    // Remove bot mention from text if present
    if (isBotMentioned) {
      text = text.replace(/@\d+\s*/g, '').trim();
      console.log(`👥 Group message with bot mention, cleaned text: ${text}`);
    }
  }

  return { msg, text, textLower, sender, isGroup, isBotMentioned };
}

// Main message handler
export async function handleMessage(msg: Message): Promise<void> {
  try {
    const ctx = await extractContext(msg);

    // Handle greeting when bot is mentioned
    if (
      ctx.isBotMentioned &&
      (ctx.textLower.includes('halo') ||
        ctx.textLower.includes('hello') ||
        ctx.textLower.includes('hi '))
    ) {
      console.log(`👋 Greeting from ${ctx.sender}`);
      await handleGreeting(msg, ctx.sender);
      return;
    }

    // For groups: only respond if bot is mentioned or message starts with command prefix
    if (ctx.isGroup) {
      if (!ctx.isBotMentioned && !ctx.text.startsWith(appConfig.commandPrefix)) {
        return;
      }
    }

    // Only process commands
    if (!ctx.text.startsWith(appConfig.commandPrefix)) return;

    // Security: Only allow whitelisted phone numbers
    if (!isAllowedUser(ctx.sender)) {
      console.log(`🚫 Blocked message from unauthorized user: ${ctx.sender}`);
      return;
    }

    if (ctx.isGroup) {
      console.log(`👥 Processing group message from ${ctx.sender}`);
    }

    // Route to feature handlers
    const result = await featureRegistry.handle(ctx);

    if (result.handled && result.response) {
      await safeReply(msg, result.response);
    } else if (!result.handled) {
      // Unknown command
      await safeReply(
        msg,
        `Unknown command 🤔\n\n` + buildHelpMessage()
      );
    }
  } catch (err) {
    console.error('❌ Error handling message:', err);
  }
}

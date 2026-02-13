import type pkg from 'whatsapp-web.js';
type Message = pkg.Message;
import { parseCommand } from './parseCommand.js';
import type { CommandRouter, CommandContext } from './commandRouter.js';
import { db } from '../db.js';
import { isAllowedUser } from '../config.js';
import { client } from '../bot.js';
import { debug, error } from '../logger.js';
import { USER_TIMEZONE_OFFSET } from './constants.js';
import { upsertUserProfile } from './userProfile.js';

// Safe reply function that handles whatsapp-web.js compatibility issues
async function safeReply(msg: Message, text: string): Promise<void> {
  debug('📤 safeReply called, sending to:', msg.from);
  debug('📤 Message preview:', text.substring(0, 50) + '...');
  try {
    // Try sendMessage with sendSeen disabled
    await client.sendMessage(msg.from, text, { sendSeen: false });
    debug('✅ Message sent successfully via sendMessage');
  } catch (err) {
    debug('⚠️ sendMessage error:', err);
    debug('⚠️ sendMessage with sendSeen:false failed, trying chat.sendMessage');
    try {
      const chat = await msg.getChat();
      await chat.sendMessage(text);
    } catch (_err2) {
      debug('⚠️ chat.sendMessage failed, trying msg.reply');
      try {
        await msg.reply(text);
      } catch (_err3) {
        error('❌ All send methods failed. Message content:', text);
      }
    }
  }
}

export function createMessageHandler(router: CommandRouter) {
  return async function handleMessage(msg: Message): Promise<void> {
    debug('\n📨 ========== MESSAGE RECEIVED ==========');
    debug('📨 From:', msg.from);
    debug('📨 Author:', msg.author);
    debug('📨 Body:', msg.body?.substring(0, 100));
    debug('📨 ========================================\n');

    try {
      let text = msg.body.trim();
      const textLower = text.toLowerCase();
      const isGroup = msg.from.endsWith('@g.us');
      const sender = msg.author ?? msg.from;

      debug(
        '🔍 Parsed: text="' + text.substring(0, 50) + '", isGroup=' + isGroup + ', sender=' + sender
      );

      // Check if bot is mentioned (for groups)
      let isBotMentioned = false;
      if (isGroup) {
        const mentions = await msg.getMentions();
        const botInfo = await client.info;
        const botNumber = botInfo?.wid?._serialized;
        isBotMentioned = mentions.some((m) => m.id._serialized === botNumber);
      }

      // Handle "Halo" greeting when bot is mentioned
      if (
        isBotMentioned &&
        (textLower.includes('halo') || textLower.includes('hello') || textLower.includes('hi '))
      ) {
        debug(`👋 Greeting from ${sender}`);

        if (isAllowedUser(sender)) {
          // Randomize opening line
          const openings = [
            `Yo! 👊`,
            `What's up 👊 Ready to log a workout?`,
            `Hey. Let's put today's work on the board 💪`,
          ];

          const randomOpening = openings[Math.floor(Math.random() * openings.length)];

          await safeReply(
            msg,
            `${randomOpening}\n` +
              `I'm your workout tracker.\n\n` +
              `Log it. Track it. Get stronger.\n\n` +
              `*What I can do:*\n` +
              `• #workout - log a workout\n` +
              `• #workout --list - see your recent workouts\n\n` +
              `*Example:*\n` +
              `#workout\n` +
              `type: bench press\n` +
              `reps: 20\n` +
              `sets: 4\n` +
              `weight: 10 (optional)\n\n` +
              `(weight is in kg, leave it blank for bodyweight)`
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
        return;
      }

      // For groups: only respond if bot is mentioned or message starts with #
      if (isGroup) {
        // In groups, require bot mention OR # prefix
        if (!isBotMentioned && !text.startsWith('#')) {
          return;
        }

        // Remove bot mention from text if present (e.g., "@Bot #workout..." → "#workout...")
        if (isBotMentioned) {
          text = text.replace(/@\d+\s*/g, '').trim();
          debug(`👥 Group message with bot mention, cleaned text: ${text}`);
        }
      }

      if (!text.startsWith('#')) {
        debug('⏭️ Skipping: message does not start with #');
        return;
      }
      debug('✅ Message starts with #, processing command...');

      // Legacy alias: migrate `#list` -> `#workout --list`
      if (textLower === '#list') {
        text = '#workout --list';
      }

      // Security: Only allow whitelisted phone numbers
      debug('🔐 Checking if user is allowed...');
      if (!isAllowedUser(sender)) {
        debug(`🚫 Blocked message from unauthorized user: ${sender}`);
        return;
      }
      debug('✅ User is allowed, continuing...');

      // Cache sender display name for digest
      const notifyName = (msg as unknown as { _data?: { notifyName?: string } })._data?.notifyName;
      if (notifyName) {
        upsertUserProfile(db, sender, notifyName);
      }

      if (isGroup) {
        debug(`👥 Processing group message from ${sender}`);
      }

      debug('🎯 Checking command: "' + text + '"');

      const invocation = parseCommand(text);
      if (!invocation) {
        debug('⏭️ Skipping: could not parse command invocation');
        return;
      }

      const ctx: CommandContext = {
        db,
        sender,
        timezoneOffsetMinutes: USER_TIMEZONE_OFFSET,
        now: () => new Date(),
      };

      const responseText = await router.route(ctx, invocation);

      if (responseText) {
        await safeReply(msg, responseText);
      }
    } catch (err) {
      error('❌ Error handling message:', err);
    }
  };
}

import type pkg from 'whatsapp-web.js';
type Message = pkg.Message;
import { parseCommand } from './parseCommand.js';
import type { CommandRouter, CommandContext } from './commandRouter.js';
import { isAllowedUser } from '../config.js';
import { debug, error } from '../logger.js';
import type { AppContext } from './appContext.js';
import { normalizeUserId } from './normalizeUserId.js';

export function createMessageHandler(router: CommandRouter, appContext: AppContext) {
  return async function handleMessage(msg: Message): Promise<void> {
    try {
      let text = msg.body.trim();
      const textLower = text.toLowerCase();
      const isGroup = msg.from.endsWith('@g.us');
      const rawSender = msg.author ?? msg.from;
      const sender = normalizeUserId(rawSender);

      debug(`📨 from=${msg.from}, rawSender=${rawSender}, sender=${sender}, isGroup=${isGroup}`);

      // Capture user contact information for persistent storage (only if not already stored)
      const existingUser = await appContext.userRepository.findById(sender);
      if (!existingUser) {
        try {
          const contact = await msg.getContact();
          await appContext.userRepository.upsert({
            id: sender,
            phoneNumber: contact.number,
            contactName: contact.name,
            pushname: contact.pushname,
          });
          debug(`👤 Captured new user: ${sender}`);
        } catch (err) {
          debug(`⚠️ Failed to capture user info for ${sender}:`, err);
        }
      }

      // Check if bot is mentioned (for groups)
      let isBotMentioned = false;
      if (isGroup) {
        const mentions = await msg.getMentions();
        const botInfo = await appContext.client.info;
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

          await appContext.messageGateway.reply(
            msg,
            `${randomOpening}\n` +
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
              `(lift accepts rep/reps and set/sets; weight is optional bodyweight)`
          );
        } else {
          await appContext.messageGateway.reply(
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
        }
      }

      if (!text.startsWith('#')) {
        return;
      }

      // Legacy alias: migrate `#list` -> `#workout --list`
      if (textLower === '#list') {
        text = '#workout --list';
      }

      // Security: Only allow whitelisted phone numbers
      if (!isAllowedUser(sender)) {
        debug(`🚫 Blocked: ${sender}`);
        return;
      }

      const invocation = parseCommand(text);
      if (!invocation) {
        return;
      }

      debug(`🎯 Command: ${invocation.namespace} --${invocation.subcommand}`);

      const ctx: CommandContext = {
        sender,
        replyChatId: msg.from,
        isGroupChat: isGroup,
        timezoneOffsetMinutes: appContext.config.userTimezoneOffsetMinutes,
        now: () => new Date(),
      };

      const responseText = await router.route(ctx, invocation);

      if (responseText) {
        await appContext.messageGateway.reply(msg, responseText);
      }
    } catch (err) {
      error('❌ Error handling message:', err);
    }
  };
}

import type pkg from 'whatsapp-web.js';
type Message = pkg.Message;
import { parseCommand } from './parseCommand.js';
import type { CommandRouter, CommandContext } from './commandRouter.js';
import { debug, error } from '../logger.js';
import type { AppContext } from './appContext.js';
import { normalizeUserId } from './normalizeUserId.js';
import { isGreeting, handleGreeting } from './greetingHandler.js';

export function createMessageHandler(router: CommandRouter, appContext: AppContext) {
  return async function handleMessage(msg: Message): Promise<void> {
    try {
      let text = msg.body.trim();
      const isGroup = msg.from.endsWith('@g.us');
      const rawSender = msg.author ?? msg.from;
      const sender = normalizeUserId(rawSender);

      debug(`📨 from=${msg.from}, rawSender=${rawSender}, sender=${sender}, isGroup=${isGroup}`);

      // Capture user contact information for persistent storage (only if not already stored)
      try {
        const contact = await msg.getContact();
        await appContext.userService.captureIfNew(sender, {
          phoneNumber: contact.number,
          contactName: contact.name,
          pushname: contact.pushname,
        });
      } catch (err) {
        debug(`⚠️ Failed to capture user info for ${sender}:`, err);
      }

      // Check if bot is mentioned (for groups)
      let isBotMentioned = false;
      if (isGroup) {
        const mentions = await msg.getMentions();
        const botInfo = await appContext.client.info;
        const botNumber = botInfo?.wid?._serialized;
        isBotMentioned = mentions.some((m) => m.id._serialized === botNumber);
      }

      // Handle greeting when bot is mentioned
      if (isBotMentioned && isGreeting(text)) {
        debug(`👋 Greeting from ${sender}`);
        await handleGreeting(
          sender,
          (reply) => appContext.messageGateway.reply(msg, reply),
          appContext
        );
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
      if (text.toLowerCase() === '#list') {
        text = '#workout --list';
      }

      // Security: Only allow whitelisted phone numbers
      if (!appContext.isAllowedUser(sender)) {
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

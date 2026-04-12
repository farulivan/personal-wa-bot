import type pkg from 'whatsapp-web.js';
type Message = pkg.Message;
import { parseCommand } from './parseCommand.js';
import type { CommandRouter, CommandContext } from './commandRouter.js';
import { error, createRequestLogger } from '../logger.js';
import type { AppContext } from './appContext.js';
import { normalizeUserId } from './normalizeUserId.js';
import { isGreeting, handleGreeting } from './greetingHandler.js';
import { createTimeContext } from './timeContext.js';

export function createMessageHandler(router: CommandRouter, appContext: AppContext) {
  return async function handleMessage(msg: Message): Promise<void> {
    try {
      let text = msg.body.trim();
      const isGroup = msg.from.endsWith('@g.us');
      const rawSender = msg.author ?? msg.from;
      const sender = normalizeUserId(rawSender);
      const reqLog = createRequestLogger(sender);

      reqLog.debug({ from: msg.from, rawSender, isGroup }, 'message received');

      // Capture user contact information for persistent storage (only if not already stored)
      try {
        const contact = await msg.getContact();
        await appContext.userService.captureIfNew(sender, {
          phoneNumber: contact.number,
          contactName: contact.name,
          pushname: contact.pushname,
        });
      } catch (err) {
        reqLog.debug({ err }, 'failed to capture user info');
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
        reqLog.debug('greeting detected');
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
        reqLog.debug('blocked by auth guard');
        return;
      }

      const invocation = parseCommand(text);
      if (!invocation) {
        return;
      }

      const { namespace, subcommand } = invocation;
      reqLog.debug({ namespace, subcommand }, 'command parsed');

      const time = createTimeContext(appContext.config.userTimezoneOffsetMinutes);

      const ctx: CommandContext = {
        sender,
        replyChatId: msg.from,
        isGroupChat: isGroup,
        time,
        timezoneOffsetMinutes: time.timezoneOffsetMinutes,
        now: time.now,
      };

      const startMs = Date.now();
      const responseText = await router.route(ctx, invocation);
      const durationMs = Date.now() - startMs;

      reqLog.info({ namespace, subcommand, durationMs }, 'command handled');

      if (responseText) {
        await appContext.messageGateway.reply(msg, responseText);
      }
    } catch (err) {
      error('❌ Error handling message:', err);
    }
  };
}

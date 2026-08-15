import { parseCommand } from './parseCommand.js';
import type { CommandRouter, CommandContext } from './commandRouter.js';
import { error, createRequestLogger } from '../logger.js';
import type { AppContext } from './appContext.js';
import type { IncomingMessage } from '../adapters/whatsapp/ports.js';
import { isGreeting, handleGreeting } from './greetingHandler.js';
import { createTimeContext } from './timeContext.js';

export function createMessageHandler(router: CommandRouter, appContext: AppContext) {
  return async function handleMessage(msg: IncomingMessage): Promise<void> {
    try {
      const { chatId, isGroup, senderId: sender } = msg;
      let text = msg.text.trim();
      const reqLog = createRequestLogger(sender);

      reqLog.debug({ chatId, sender, isGroup }, 'message received');

      // Match on any form this sender is known by. The two forms are the same
      // WhatsApp account, so this is not a widening of the allowlist — it just
      // stops a chat switching to LID addressing from locking everyone out.
      const isAllowed = msg.senderCandidates.some((candidate) =>
        appContext.isAllowedUser(candidate)
      );

      if (!isAllowed) {
        reqLog.debug('blocked by auth guard');
        return;
      }

      if (isGroup) {
        const looksLikeCommand = text.startsWith('#');
        const looksLikeBotInteraction =
          text.includes('@') && (text.includes('#') || isGreeting(text));
        if (!looksLikeCommand && !looksLikeBotInteraction) {
          return;
        }
      }

      try {
        await appContext.userService.captureIfNew(sender, await msg.getContact());
      } catch (err) {
        reqLog.debug({ err }, 'failed to capture user info');
      }

      let isBotMentioned = false;
      if (isGroup && text.includes('@')) {
        isBotMentioned = await msg.isBotMentioned();
      }

      if (isBotMentioned && isGreeting(text)) {
        reqLog.debug('greeting detected');
        await handleGreeting(
          sender,
          (reply) => appContext.messageGateway.reply(msg, reply),
          appContext
        );
        return;
      }

      if (isGroup) {
        if (!isBotMentioned && !text.startsWith('#')) {
          return;
        }

        if (isBotMentioned) {
          text = text.replace(/@\d+\s*/g, '').trim();
        }
      }

      if (!text.startsWith('#')) {
        return;
      }

      if (text.toLowerCase() === '#list') {
        text = '#workout list';
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
        replyChatId: chatId,
        isGroupChat: isGroup,
        time,
      };

      const startMs = Date.now();
      const result = await router.route(ctx, invocation);
      const durationMs = Date.now() - startMs;

      reqLog.info({ namespace, subcommand, durationMs }, 'command handled');

      if (result) {
        if (typeof result === 'string') {
          await appContext.messageGateway.reply(msg, result);
        } else {
          await appContext.messageGateway.reply(msg, result.text, result.mentions);
        }
      }
    } catch (err) {
      error({ err }, '❌ Error handling message');
    }
  };
}

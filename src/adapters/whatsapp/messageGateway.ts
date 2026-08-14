import { error } from '../../logger.js';
import type { IncomingMessage, MessageSenderPort } from './ports.js';

export type MessageGateway = {
  /** `mentionNumbers` are bare phone numbers; the sender turns them into JIDs. */
  reply: (msg: IncomingMessage, text: string, mentionNumbers?: string[]) => Promise<void>;
  sendMessage: (chatId: string, text: string, mentionNumbers?: string[]) => Promise<unknown>;
};

/**
 * Replying is just sending to the chat the message came from. It stays a
 * separate seam because the handler holds an IncomingMessage rather than a
 * chat id, and because a failed reply is logged rather than thrown — one bad
 * send should not take down the message loop.
 */
export function createMessageGateway(sender: MessageSenderPort): MessageGateway {
  return {
    sendMessage: (chatId, text, mentionNumbers) => sender.sendMessage(chatId, text, mentionNumbers),

    async reply(msg, text, mentionNumbers): Promise<void> {
      try {
        await sender.sendMessage(msg.chatId, text, mentionNumbers);
      } catch (err) {
        error({ err, chatId: msg.chatId }, 'failed to send reply');
      }
    },
  };
}

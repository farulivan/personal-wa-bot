import { debug, error } from '../../logger.js';
import type { IncomingMessage } from './ports.js';

type WhatsAppClientLike = {
  sendMessage: (
    chatId: string,
    text: string,
    options?: { sendSeen?: boolean; mentions?: string[] }
  ) => Promise<unknown>;
};

export type MessageGateway = {
  /** `mentionNumbers` are bare phone numbers; this adapter turns them into JIDs. */
  reply: (msg: IncomingMessage, text: string, mentionNumbers?: string[]) => Promise<void>;
  sendMessage: (chatId: string, text: string, mentionNumbers?: string[]) => Promise<unknown>;
};

export function createMessageGateway(client: WhatsAppClientLike): MessageGateway {
  function buildOptions(
    chatId: string,
    mentionNumbers?: string[]
  ): { sendSeen: boolean; mentions?: string[] } {
    const opts: { sendSeen: boolean; mentions?: string[] } = { sendSeen: false };
    const isGroup = chatId.endsWith('@g.us');
    if (isGroup && mentionNumbers && mentionNumbers.length > 0) {
      opts.mentions = mentionNumbers.map((phoneNumber) => `${phoneNumber}@c.us`);
    }
    return opts;
  }

  function sendMessage(chatId: string, text: string, mentionNumbers?: string[]): Promise<unknown> {
    return client.sendMessage(chatId, text, buildOptions(chatId, mentionNumbers));
  }

  async function reply(
    msg: IncomingMessage,
    text: string,
    mentionNumbers?: string[]
  ): Promise<void> {
    try {
      await client.sendMessage(msg.chatId, text, buildOptions(msg.chatId, mentionNumbers));
      return;
    } catch (_err) {
      debug({ method: 'client.sendMessage' }, 'send failed, trying fallbacks');
    }

    for (const fallback of msg.replyFallbacks ?? []) {
      try {
        await fallback.send(text);
        return;
      } catch (_err) {
        debug({ method: fallback.name }, 'send failed, trying next fallback');
      }
    }

    error({ chatId: msg.chatId }, 'all send methods failed');
  }

  return { reply, sendMessage };
}

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
  reply: (msg: IncomingMessage, text: string, mentions?: string[]) => Promise<void>;
  sendMessage: (chatId: string, text: string, mentions?: string[]) => Promise<unknown>;
};

export function createMessageGateway(client: WhatsAppClientLike): MessageGateway {
  function buildOptions(
    chatId: string,
    mentions?: string[]
  ): { sendSeen: boolean; mentions?: string[] } {
    const opts: { sendSeen: boolean; mentions?: string[] } = { sendSeen: false };
    const isGroup = chatId.endsWith('@g.us');
    if (isGroup && mentions && mentions.length > 0) {
      opts.mentions = mentions;
    }
    return opts;
  }

  function sendMessage(chatId: string, text: string, mentions?: string[]): Promise<unknown> {
    return client.sendMessage(chatId, text, buildOptions(chatId, mentions));
  }

  async function reply(msg: IncomingMessage, text: string, mentions?: string[]): Promise<void> {
    try {
      await client.sendMessage(msg.chatId, text, buildOptions(msg.chatId, mentions));
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

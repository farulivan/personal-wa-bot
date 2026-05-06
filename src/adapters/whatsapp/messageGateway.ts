import type pkg from 'whatsapp-web.js';
import { debug, error } from '../../logger.js';

type Message = pkg.Message;

type ChatLike = {
  sendMessage: (text: string) => Promise<unknown>;
};

type WhatsAppClientLike = {
  sendMessage: (
    chatId: string,
    text: string,
    options?: { sendSeen?: boolean; mentions?: string[] }
  ) => Promise<unknown>;
};

export type MessageGateway = {
  reply: (msg: Message, text: string, mentions?: string[]) => Promise<void>;
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

  async function reply(msg: Message, text: string, mentions?: string[]): Promise<void> {
    try {
      await client.sendMessage(msg.from, text, buildOptions(msg.from, mentions));
    } catch (_err) {
      debug({ method: 'client.sendMessage' }, 'send failed, trying chat.sendMessage');
      try {
        const chat = (await msg.getChat()) as ChatLike;
        await chat.sendMessage(text); // fallbacks lose mentions — acceptable
      } catch (_err2) {
        debug({ method: 'chat.sendMessage' }, 'send failed, trying msg.reply');
        try {
          await msg.reply(text);
        } catch (_err3) {
          error({ chatId: msg.from }, 'all send methods failed');
        }
      }
    }
  }

  return { reply, sendMessage };
}

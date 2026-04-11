import type pkg from 'whatsapp-web.js';
import { debug, error } from '../../logger.js';

type Message = pkg.Message;

type ChatLike = {
  sendMessage: (text: string) => Promise<unknown>;
};

type WhatsAppClientLike = {
  sendMessage: (chatId: string, text: string, options?: { sendSeen?: boolean }) => Promise<unknown>;
};

export type MessageGateway = {
  reply: (msg: Message, text: string) => Promise<void>;
  sendMessage: (chatId: string, text: string) => Promise<unknown>;
};

export function createMessageGateway(client: WhatsAppClientLike): MessageGateway {
  function sendMessage(chatId: string, text: string): Promise<unknown> {
    return client.sendMessage(chatId, text, { sendSeen: false });
  }

  async function reply(msg: Message, text: string): Promise<void> {
    try {
      await client.sendMessage(msg.from, text, { sendSeen: false });
    } catch (_err) {
      debug('⚠️ sendMessage failed, trying chat.sendMessage');
      try {
        const chat = (await msg.getChat()) as ChatLike;
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

  return { reply, sendMessage };
}

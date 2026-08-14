import type pkg from 'whatsapp-web.js';
import { normalizeUserId } from '../../app/normalizeUserId.js';
import type { IncomingMessage } from './ports.js';

type Message = pkg.Message;

type ChatLike = {
  sendMessage: (text: string) => Promise<unknown>;
};

type BotIdentityClientLike = {
  info?:
    | { wid?: { _serialized?: string } }
    | Promise<{ wid?: { _serialized?: string } } | undefined>;
};

/**
 * Translates a whatsapp-web.js Message into the transport-neutral shape the
 * app layer works with. Everything that needs a puppeteer round trip stays
 * behind a thunk so the handler only pays for what it actually reads.
 */
export function createIncomingMessageMapper(
  client: BotIdentityClientLike
): (msg: Message) => IncomingMessage {
  return function toIncomingMessage(msg: Message): IncomingMessage {
    const chatId = msg.from;

    return {
      chatId,
      isGroup: chatId.endsWith('@g.us'),
      senderId: normalizeUserId(msg.author ?? msg.from),
      text: msg.body,

      getContact: async () => {
        const contact = await msg.getContact();
        return {
          phoneNumber: contact.number,
          contactName: contact.name,
          pushname: contact.pushname,
        };
      },

      isBotMentioned: async () => {
        const mentions = await msg.getMentions();
        const info = await client.info;
        const botNumber = info?.wid?._serialized;
        return mentions.some((mention) => mention.id._serialized === botNumber);
      },

      // Puppeteer IPC is flaky enough that a failed send is worth retrying
      // down a different path. Both of these lose mentions — acceptable, as
      // they only run once the mention-carrying send has already failed.
      replyFallbacks: [
        {
          name: 'chat.sendMessage',
          send: async (text) => {
            const chat = (await msg.getChat()) as ChatLike;
            return chat.sendMessage(text);
          },
        },
        {
          name: 'msg.reply',
          send: (text) => msg.reply(text),
        },
      ],
    };
  };
}

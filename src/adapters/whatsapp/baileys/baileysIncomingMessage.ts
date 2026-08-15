import { toPhoneNumber, toWaUserId } from '../../../shared/identity.js';
import { normalizeMessageContent } from '@whiskeysockets/baileys';
import type { WAMessage } from '@whiskeysockets/baileys';

import type { IncomingMessage } from '../ports.js';
import {
  resolveSenderIdentity,
  toDbUserId,
  toDbUserIdCandidates,
} from './resolveSenderIdentity.js';

const GROUP_SUFFIX = '@g.us';

/** Plain text from either a bare conversation or an extended text message. */
export function extractText(message: WAMessage): string {
  const content = normalizeMessageContent(message.message ?? undefined);
  return content?.conversation ?? content?.extendedTextMessage?.text ?? '';
}

function extractMentionedJids(message: WAMessage): string[] {
  const content = normalizeMessageContent(message.message ?? undefined);
  return content?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
}

/**
 * Maps a decoded Baileys message onto the transport-neutral shape, or returns
 * null for anything the bot should not react to at all.
 *
 * Unlike the whatsapp-web.js mapper, the deferred fields here are already in
 * memory — pushName and mentionedJid come off the same stanza — so the thunks
 * cost nothing and exist only to satisfy the shared port.
 */
export function toIncomingMessage(
  message: WAMessage,
  botIdentity: { pnJid?: string; lidJid?: string }
): IncomingMessage | null {
  const chatId = message.key.remoteJid;
  if (!chatId || message.key.fromMe) {
    return null;
  }

  const text = extractText(message);
  if (text.trim() === '') {
    return null;
  }

  const isGroup = chatId.endsWith(GROUP_SUFFIX);
  const identity = resolveSenderIdentity(message.key, isGroup);
  const senderId = toDbUserId(identity);
  if (senderId === '') {
    return null;
  }

  // A mention can name the bot by either of its identity forms, depending on
  // how the group addresses members.
  const botIds = new Set(
    [botIdentity.pnJid, botIdentity.lidJid]
      .filter((jid): jid is string => Boolean(jid))
      .map(toWaUserId)
  );

  return {
    chatId,
    isGroup,
    senderId,
    senderCandidates: toDbUserIdCandidates(identity),
    text,
    getContact: async () => ({
      phoneNumber: identity.pnJid ? toPhoneNumber(identity.pnJid) : undefined,
      // Baileys has no address book — the only name available is the one the
      // sender set on their own profile.
      contactName: undefined,
      pushname: message.pushName ?? undefined,
    }),
    isBotMentioned: async () =>
      extractMentionedJids(message).some((jid) => botIds.has(toWaUserId(jid))),
  };
}

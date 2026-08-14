import type { GroupMemberIdentity } from './waId.js';

export type { GroupMemberIdentity };

/**
 * Best-effort identity details for user capture. Every field is optional
 * because transports differ in what they can supply — whatsapp-web.js reads
 * the address book, Baileys only sees the name the sender set on their own.
 */
export type IncomingContact = {
  phoneNumber?: string;
  contactName?: string;
  pushname?: string;
};

/**
 * An alternative send path, tried when the primary send fails. `name` labels
 * the path in logs. Transports that only have one way to send omit these.
 */
export type ReplyFallback = {
  name: string;
  send: (text: string) => Promise<unknown>;
};

/**
 * A received text message in terms the app layer can reason about without
 * knowing which WhatsApp library produced it.
 *
 * `getContact` and `isBotMentioned` are deferred rather than eager: the
 * handler resolves them only after the auth guard and the group filter have
 * passed, and under whatsapp-web.js each one costs a puppeteer round trip.
 */
export type IncomingMessage = {
  /** Chat the message arrived in; also the reply target. */
  chatId: string;
  /** Decided by the adapter — the app layer must not sniff JID suffixes. */
  isGroup: boolean;
  /** Already normalized to the bare id used as our db user id. */
  senderId: string;
  text: string;
  getContact: () => Promise<IncomingContact>;
  isBotMentioned: () => Promise<boolean>;
  replyFallbacks?: ReplyFallback[];
};

export interface GroupMembershipPort {
  listMemberIdentities(groupId: string): Promise<GroupMemberIdentity[]>;
  resolveBotUserId(): Promise<string | null>;
}

export interface MessageSenderPort {
  /**
   * `mentionNumbers` are bare phone numbers, not JIDs — the adapter builds
   * whatever form its transport needs. Mentions only apply to group chats and
   * are ignored elsewhere.
   */
  sendMessage(chatId: string, text: string, mentionNumbers?: string[]): Promise<unknown>;
}

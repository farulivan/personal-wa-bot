import type { PhoneNumber, WaUserId } from '../../shared/identity.js';

/**
 * One group member, in every id form we might match them by. WhatsApp
 * addresses people by phone number or by LID depending on the chat, so
 * `primaryId` is the form this group addresses them by — matching what we
 * store as a user id — while `aliases` carries every form.
 *
 * Always match on `aliases`. A chat can switch addressing mode, and a stored
 * row keyed under the older form would otherwise stop resolving.
 */
export type GroupMemberIdentity = {
  primaryId: WaUserId;
  aliases: WaUserId[];
};

/**
 * Best-effort identity details for user capture. Every field is optional
 * because transports differ in what they can supply — whatsapp-web.js reads
 * the address book, Baileys only sees the name the sender set on their own.
 */
export type IncomingContact = {
  phoneNumber?: PhoneNumber;
  contactName?: string;
  pushname?: string;
};

/**
 * A received text message in terms the app layer can reason about without
 * knowing which WhatsApp library produced it.
 *
 * `getContact` and `isBotMentioned` are deferred rather than eager: the
 * handler resolves them only after the auth guard and the group filter have
 * passed, so a transport that has to go and fetch them does not pay for
 * messages the bot ignores.
 */
export type IncomingMessage = {
  /** Chat the message arrived in; also the reply target. */
  chatId: string;
  /** Decided by the adapter — the app layer must not sniff JID suffixes. */
  isGroup: boolean;
  /** Already normalized to the bare id used as our db user id. */
  senderId: WaUserId;
  /**
   * Every id this sender could be known by, `senderId` first. WhatsApp is
   * migrating chats from phone-number to LID addressing, and a chat that flips
   * changes which form arrives — so identity checks match on any of these
   * rather than going deaf to someone we already know.
   */
  senderCandidates: WaUserId[];
  text: string;
  getContact: () => Promise<IncomingContact>;
  isBotMentioned: () => Promise<boolean>;
};

export interface GroupMembershipPort {
  listMemberIdentities(groupId: string): Promise<GroupMemberIdentity[]>;
  resolveBotUserId(): Promise<WaUserId | null>;
}

export interface MessageSenderPort {
  /**
   * `mentionNumbers` are bare phone numbers, not JIDs — the adapter builds
   * whatever form its transport needs. Mentions only apply to group chats and
   * are ignored elsewhere.
   */
  sendMessage(chatId: string, text: string, mentionNumbers?: PhoneNumber[]): Promise<unknown>;
}

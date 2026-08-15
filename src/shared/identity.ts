/**
 * Two kinds of identifier that look identical to a human and to the compiler,
 * and have been confused repeatedly at real cost.
 *
 * WhatsApp addresses people either by phone number or by LID, and which one
 * you get depends on the chat. This bot's rows are keyed by whichever form
 * WhatsApp used — and in our chats that is the **LID**, not the phone number.
 * `users.id` and the allowlist both hold LIDs; `users.phone_number` is separate
 * metadata that does not match the id.
 *
 * Deriving a user id from a phone number therefore orphans every existing row
 * and makes the allowlist reject people it used to admit. That failure is
 * silent, so these brands exist to make the compiler catch it instead.
 *
 * Neither type is constructible by hand: go through `toWaUserId` /
 * `toPhoneNumber`, which is where the intent gets stated.
 */

declare const WA_USER_ID: unique symbol;
declare const PHONE_NUMBER: unique symbol;

/** The bare form of the JID WhatsApp addressed someone by. Usually a LID here. */
export type WaUserId = string & { readonly [WA_USER_ID]: true };

/** A bare phone number. Never a user id — see the note above. */
export type PhoneNumber = string & { readonly [PHONE_NUMBER]: true };

/**
 * Strips the optional device suffix and the server part from any JID form we
 * see: @c.us (whatsapp-web.js), @s.whatsapp.net and @lid (Baileys), @g.us.
 *
 *   "628123456789@c.us"              -> "628123456789"
 *   "628123456789@s.whatsapp.net"    -> "628123456789"
 *   "628123456789:12@s.whatsapp.net" -> "628123456789"
 *   "199887766554433@lid"            -> "199887766554433"
 *
 * Anchored, so a mid-string `@` is left alone.
 */
export function stripJidServer(jid: string): string {
  return jid.replace(/(?::\d+)?@(c\.us|s\.whatsapp\.net|lid|g\.us)$/, '');
}

/**
 * Marks a value as the id we key rows by. Pass the JID WhatsApp addressed the
 * person with — not their phone number, unless that is genuinely what
 * addressed them.
 */
export function toWaUserId(addressedJid: string): WaUserId {
  return stripJidServer(addressedJid) as WaUserId;
}

/** Marks a value as a phone number. Pass a phone JID or bare digits. */
export function toPhoneNumber(phoneJid: string): PhoneNumber {
  return stripJidServer(phoneJid) as PhoneNumber;
}

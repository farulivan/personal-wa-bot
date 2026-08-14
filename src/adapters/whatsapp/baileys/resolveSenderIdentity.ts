import { isLidUser, jidNormalizedUser, WAMessageAddressingMode } from '@whiskeysockets/baileys';
import type { WAMessageKey } from '@whiskeysockets/baileys';
import { normalizeUserId } from '../../../app/normalizeUserId.js';

export type SenderIdentity = {
  /** Phone-number form (@s.whatsapp.net), when WhatsApp supplied one. */
  pnJid?: string;
  /** LID form (@lid), when WhatsApp supplied one. */
  lidJid?: string;
  /** Whatever the stanza actually addressed the sender by. */
  rawJid: string;
};

/**
 * Works out both forms of a sender's identity from a message key.
 *
 * WhatsApp addresses a message either by phone number or by LID, and hands us
 * the other form alongside it. `addressingMode` says which one is primary:
 * under 'lid' the raw JID is the LID and the alt is the phone number, under
 * 'pn' it is the other way round. This mirrors Baileys' own
 * `extractAddressingContext`.
 *
 * Getting this backwards is not a visible bug — it silently produces a
 * different db user id for the same person, which forks their history.
 */
export function resolveSenderIdentity(key: WAMessageKey, isGroup: boolean): SenderIdentity {
  const rawJid = (isGroup ? key.participant : key.remoteJid) ?? '';
  const altJid = (isGroup ? key.participantAlt : key.remoteJidAlt) || undefined;
  const addressingMode =
    key.addressingMode ??
    (isLidUser(rawJid) ? WAMessageAddressingMode.LID : WAMessageAddressingMode.PN);
  const isLidAddressed = addressingMode === WAMessageAddressingMode.LID;

  const pnJid = isLidAddressed ? altJid : rawJid || undefined;
  const lidJid = isLidAddressed ? rawJid || undefined : altJid;

  return {
    pnJid: pnJid ? jidNormalizedUser(pnJid) : undefined,
    lidJid: lidJid ? jidNormalizedUser(lidJid) : undefined,
    rawJid,
  };
}

/**
 * The id we store and match against. Always prefers the phone form: that is
 * what whatsapp-web.js gave us, so it is what existing rows and
 * ALLOWED_NUMBERS hold.
 */
export function toDbUserId(identity: SenderIdentity): string {
  return normalizeUserId(identity.pnJid ?? identity.lidJid ?? identity.rawJid);
}

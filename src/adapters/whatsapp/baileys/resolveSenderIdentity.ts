import type { WaUserId } from '../../../shared/identity.js';
import { toWaUserId } from '../../../shared/identity.js';
import { isLidUser, jidNormalizedUser, WAMessageAddressingMode } from '@whiskeysockets/baileys';
import type { WAMessageKey } from '@whiskeysockets/baileys';

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
 * The id we store and match against: the form WhatsApp actually addressed the
 * sender by, which in a lid-addressed chat is their LID, not their phone number.
 *
 * This is compatibility, not preference. whatsapp-web.js passed `msg.author`
 * through verbatim, so that raw form is what `users.id` and `ALLOWED_WA_IDS`
 * already hold — which is why stripping `@lid` has always been necessary.
 * Deriving the id any other way orphans every existing row and makes the
 * allowlist reject people it used to admit.
 */
export function toDbUserId(identity: SenderIdentity): WaUserId {
  return toWaUserId(identity.rawJid || identity.pnJid || identity.lidJid || '');
}

/**
 * Every id this sender could be known by, most-likely first. Lets a caller
 * find an existing row even if WhatsApp has since switched the chat between
 * phone-number and LID addressing.
 */
export function toDbUserIdCandidates(identity: SenderIdentity): WaUserId[] {
  const candidates = [identity.rawJid, identity.pnJid, identity.lidJid]
    .filter((jid): jid is string => Boolean(jid))
    .map(toWaUserId)
    .filter((id) => id !== '');

  return Array.from(new Set(candidates));
}

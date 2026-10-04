import { proto } from '@whiskeysockets/baileys';

/** The slice of Baileys' credentials this reads. */
type CredsWithAccount = {
  account?: { details?: Uint8Array | string | null } | null;
};

export type SessionAgeFields = { linkedAt?: string; sessionAgeDays?: number };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * When the phone linked this session.
 *
 * At pairing the phone signs a device identity for the bot, and that identity
 * carries the time it was signed. Baileys keeps it in the credentials, so the
 * link time needs no file of its own and is there for a session that was
 * linked before this code existed.
 *
 * `details` arrives in two shapes. It is bytes right after a pairing, and a
 * base64 string once the credentials have been saved and read back, because
 * the protobuf object serializes itself that way. Every boot sees the string.
 *
 * Returns undefined rather than throwing: an unpaired session has no identity
 * yet, and this only ever feeds a log line.
 */
export function sessionLinkedAt(creds: CredsWithAccount): Date | undefined {
  const details = creds.account?.details;
  if (!details) {
    return undefined;
  }

  try {
    const bytes = typeof details === 'string' ? Buffer.from(details, 'base64') : details;
    const seconds = Number(proto.ADVDeviceIdentity.decode(bytes).timestamp);

    return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The two fields a log line needs to say how old the session is. Empty when
 * the link time is unknown, so it can be spread into any log call.
 *
 * The 2026-10-03 logout could not be explained partly because this number was
 * gone: the wipe deletes the session, and the logs did not reach back to when
 * it was linked. An age of almost exactly 14 days means WhatsApp has not been
 * used on the phone since the scan, which is one of the two known causes.
 */
export function sessionAgeFields(linkedAt: Date | undefined, now: Date): SessionAgeFields {
  if (!linkedAt) {
    return {};
  }

  const days = (now.getTime() - linkedAt.getTime()) / MS_PER_DAY;

  return { linkedAt: linkedAt.toISOString(), sessionAgeDays: Math.round(days * 10) / 10 };
}

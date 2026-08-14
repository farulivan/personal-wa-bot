import { isLidUser } from '@whiskeysockets/baileys';

/** The slice of Baileys' GroupParticipant we actually rely on. */
export type ParticipantLike = {
  id: string;
  phoneNumber?: string;
  lid?: string;
};

/** The slice of Baileys' GroupMetadata we actually rely on. */
export type GroupMetadataLike = {
  /** 'pn' or 'lid' — which form this group addresses its members by. */
  addressingMode?: string;
  participants: ParticipantLike[];
};

export type FetchGroupMetadata = (groupId: string) => Promise<GroupMetadataLike>;

/**
 * Both forms of a participant's identity. Baileys populates exactly one of
 * `phoneNumber`/`lid` as the complement of `id`, depending on which form the
 * group addresses by, so this normalizes that into a predictable pair.
 */
export function participantJids(participant: ParticipantLike): {
  pnJid?: string;
  lidJid?: string;
} {
  const primaryIsLid = isLidUser(participant.id);
  return {
    pnJid: (primaryIsLid ? participant.phoneNumber : participant.id) || undefined,
    lidJid: (primaryIsLid ? participant.id : participant.lid) || undefined,
  };
}

/**
 * Caches group metadata for a short window. Digest sends resolve mentions for
 * every at-risk member in one pass, and without this each one is a round trip.
 */
export function createGroupMetadataCache(
  fetch: FetchGroupMetadata,
  ttlMs = 5 * 60_000,
  now: () => number = Date.now
): FetchGroupMetadata {
  const entries = new Map<string, { at: number; metadata: GroupMetadataLike }>();

  return async function fetchCached(groupId: string): Promise<GroupMetadataLike> {
    const cached = entries.get(groupId);
    if (cached && now() - cached.at < ttlMs) {
      return cached.metadata;
    }

    const metadata = await fetch(groupId);
    entries.set(groupId, { at: now(), metadata });
    return metadata;
  };
}

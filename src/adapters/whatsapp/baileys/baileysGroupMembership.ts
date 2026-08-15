import type { WaUserId } from '../../../shared/identity.js';
import { toWaUserId } from '../../../shared/identity.js';
import { isLidUser } from '@whiskeysockets/baileys';

import type { GroupMemberIdentity, GroupMembershipPort } from '../ports.js';
import { participantJids } from './groupMetadata.js';
import type { FetchGroupMetadata, ParticipantLike } from './groupMetadata.js';

/** The slice of Baileys' own Contact we need to identify the logged-in bot. */
export type BotContactLike = {
  id: string;
  phoneNumber?: string;
  lid?: string;
};

/**
 * Both identity forms for one group member, with the phone form preferred as
 * primary — that is the id our db rows and ALLOWED_WA_IDS hold.
 */
export function toGroupMemberIdentity(participant: ParticipantLike): GroupMemberIdentity | null {
  const { pnJid, lidJid } = participantJids(participant);

  const aliases = Array.from(
    new Set([pnJid, lidJid].filter((jid): jid is string => Boolean(jid)).map(toWaUserId))
  );
  if (aliases.length === 0) {
    return null;
  }

  return {
    // participant.id is the form this group addresses members by, which is the
    // same form our db rows are keyed on. Matching is done on aliases, but
    // keeping primaryId consistent with toDbUserId avoids a trap later.
    primaryId: toWaUserId(participant.id) || aliases[0],
    aliases,
  };
}

export function resolveBotUserIdFrom(user: BotContactLike | undefined): WaUserId | null {
  if (!user?.id) {
    return null;
  }

  const pnJid = isLidUser(user.id) ? user.phoneNumber : user.id;
  return toWaUserId(pnJid || user.id);
}

export class BaileysGroupMembershipAdapter implements GroupMembershipPort {
  constructor(
    private readonly fetchGroupMetadata: FetchGroupMetadata,
    private readonly getBotContact: () => BotContactLike | undefined
  ) {}

  async listMemberIdentities(groupId: string): Promise<GroupMemberIdentity[]> {
    const metadata = await this.fetchGroupMetadata(groupId);
    return metadata.participants
      .map(toGroupMemberIdentity)
      .filter((identity): identity is GroupMemberIdentity => identity !== null);
  }

  async resolveBotUserId(): Promise<WaUserId | null> {
    return resolveBotUserIdFrom(this.getBotContact());
  }
}

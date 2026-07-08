import type { GroupMembershipPort } from './ports.js';
import { listGroupMemberIdentitiesExcludingBot } from './listGroupMemberIdentitiesExcludingBot.js';

/**
 * Returns the db user ids of group members that are *known* — i.e. one of their
 * WhatsApp aliases matches an entry in `knownDbUserIds`. Members with no match
 * (people who have no data yet, or who never used the bot) are dropped, so
 * callers only act on members who already have data in this group.
 *
 * This mirrors the "candidates ∩ group members" intersection that
 * `resolveMentionablePhoneNumbers` performs for mentions — same idea, keyed by
 * db user id instead of phone number.
 */
export async function resolveKnownGroupDbUserIds(
  port: GroupMembershipPort,
  groupChatId: string,
  knownDbUserIds: string[]
): Promise<string[]> {
  const groupMemberIdentities = await listGroupMemberIdentitiesExcludingBot(port, groupChatId);

  const knownUsers = new Set(knownDbUserIds);
  const targetUserIdSet = new Set<string>();

  for (const member of groupMemberIdentities) {
    const matchedDbId = member.aliases.find((alias: string) => knownUsers.has(alias));
    if (matchedDbId !== undefined) {
      targetUserIdSet.add(matchedDbId);
    }
  }

  return Array.from(targetUserIdSet);
}

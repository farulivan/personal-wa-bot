import type { GroupMemberIdentity } from './waId.js';
import type { GroupMembershipPort } from './ports.js';

/**
 * Fetches the group's member identities and removes the bot's own identity.
 * Shared building block for higher-level helpers like `resolveKnownGroupDbUserIds`
 * and `resolveMentionablePhoneNumbers` so the "fetch + exclude bot" prelude
 * lives in one place.
 *
 * Throws if the membership port throws — callers decide whether to swallow.
 */
export async function listGroupMemberIdentitiesExcludingBot(
  port: GroupMembershipPort,
  groupChatId: string
): Promise<GroupMemberIdentity[]> {
  const [memberIdentities, botUserId] = await Promise.all([
    port.listMemberIdentities(groupChatId),
    port.resolveBotUserId(),
  ]);

  return botUserId
    ? memberIdentities.filter((member) => !member.aliases.includes(botUserId))
    : memberIdentities;
}

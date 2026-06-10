import { error } from '../../logger.js';
import type { GroupMembershipPort } from './ports.js';
import { listGroupMemberIdentitiesExcludingBot } from './listGroupMemberIdentitiesExcludingBot.js';

/**
 * Returns the subset of `candidatePhoneNumbers` that belong to a member of the
 * given group, i.e. the phone numbers we may render as `@phone` mentions in
 * a message bound for `groupChatId`.
 *
 * - `groupChatId === null` (DM) ⇒ empty Set (mentions are pointless in DMs).
 * - Membership-port failure ⇒ logged + empty Set (degrades to "no mentions"
 *   rather than blocking the digest or leaderboard reply).
 *
 * Phone numbers are matched as-is against the group's normalized member
 * aliases, which already include phone-style serializations after
 * `getContactLidAndPhone` enrichment in `listGroupMemberIdentities`.
 */
export async function resolveMentionablePhoneNumbers(
  membershipPort: GroupMembershipPort,
  groupChatId: string | null,
  candidatePhoneNumbers: Array<string | null>
): Promise<Set<string>> {
  if (groupChatId === null) return new Set();

  const phones = new Set(candidatePhoneNumbers.filter((p): p is string => p !== null && p !== ''));
  if (phones.size === 0) return new Set();

  try {
    const identities = await listGroupMemberIdentitiesExcludingBot(membershipPort, groupChatId);
    const aliasSet = new Set(identities.flatMap((m) => m.aliases));
    return new Set([...phones].filter((p) => aliasSet.has(p)));
  } catch (err) {
    error(`🏷️ Failed to resolve mentionable phone numbers for ${groupChatId}:`, err);
    return new Set();
  }
}

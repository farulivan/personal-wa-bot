import type { GroupMembershipPort } from './ports.js';
import { listGroupMemberIdentitiesExcludingBot } from './listGroupMemberIdentitiesExcludingBot.js';

export async function resolveGroupDbUserIds(
  port: GroupMembershipPort,
  groupChatId: string,
  knownDbUserIds: string[]
): Promise<string[]> {
  const groupMemberIdentities = await listGroupMemberIdentitiesExcludingBot(port, groupChatId);

  const knownUsers = new Set(knownDbUserIds);
  const targetUserIdSet = new Set<string>();

  for (const member of groupMemberIdentities) {
    const matchedDbId = member.aliases.find((alias: string) => knownUsers.has(alias));
    const dbUserId = matchedDbId ?? member.primaryId;
    targetUserIdSet.add(dbUserId);
  }

  return Array.from(targetUserIdSet);
}

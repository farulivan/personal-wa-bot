import type { GroupMembershipPort } from './ports.js';

export async function resolveGroupDbUserIds(
  port: GroupMembershipPort,
  groupChatId: string,
  knownDbUserIds: string[]
): Promise<string[]> {
  const [memberIdentities, botUserId] = await Promise.all([
    port.listMemberIdentities(groupChatId),
    port.resolveBotUserId(),
  ]);

  const groupMemberIdentities = botUserId
    ? memberIdentities.filter((member) => !member.aliases.includes(botUserId))
    : memberIdentities;

  const knownUsers = new Set(knownDbUserIds);
  const targetUserIdSet = new Set<string>();

  for (const member of groupMemberIdentities) {
    const matchedDbId = member.aliases.find((alias: string) => knownUsers.has(alias));
    const dbUserId = matchedDbId ?? member.primaryId;
    targetUserIdSet.add(dbUserId);
  }

  return Array.from(targetUserIdSet);
}

import {
  listGroupMemberIdentities,
  resolveNormalizedBotUserId,
  type BotInfoClientLike,
  type GroupMemberClientLike,
} from './waId.js';

export type GroupDbUserResolverClientLike = GroupMemberClientLike & BotInfoClientLike;

export async function resolveGroupDbUserIds(
  client: GroupDbUserResolverClientLike,
  groupChatId: string,
  knownDbUserIds: string[]
): Promise<string[]> {
  const [memberIdentities, botUserId] = await Promise.all([
    listGroupMemberIdentities(client, groupChatId),
    resolveNormalizedBotUserId(client),
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

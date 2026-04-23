import {
  listGroupMemberIdentities,
  resolveNormalizedBotUserId,
  type GroupMemberClientLike,
  type BotInfoClientLike,
  type GroupMemberIdentity,
} from './waId.js';
import type { GroupMembershipPort } from './ports.js';

type AdapterClient = GroupMemberClientLike & BotInfoClientLike;

export class WhatsAppGroupMembershipAdapter implements GroupMembershipPort {
  constructor(private readonly client: AdapterClient) {}

  listMemberIdentities(groupId: string): Promise<GroupMemberIdentity[]> {
    return listGroupMemberIdentities(this.client, groupId);
  }

  resolveBotUserId(): Promise<string | null> {
    return resolveNormalizedBotUserId(this.client);
  }
}

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
  constructor(
    private readonly client: AdapterClient,
    private readonly groupId: string
  ) {}

  listMemberIdentities(_groupId: string): Promise<GroupMemberIdentity[]> {
    return listGroupMemberIdentities(this.client, this.groupId);
  }

  resolveBotUserId(): Promise<string | null> {
    return resolveNormalizedBotUserId(this.client);
  }
}

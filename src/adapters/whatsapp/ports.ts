import type { GroupMemberIdentity } from './waId.js';

export type { GroupMemberIdentity };

export interface GroupMembershipPort {
  listMemberIdentities(groupId: string): Promise<GroupMemberIdentity[]>;
  resolveBotUserId(): Promise<string | null>;
}

export interface MessageSenderPort {
  sendMessage(chatId: string, text: string, mentions?: string[]): Promise<unknown>;
}

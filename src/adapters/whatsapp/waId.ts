import { normalizeUserId } from '../../app/normalizeUserId.js';

export type SerializedId = {
  _serialized?: string;
};

export type ParticipantLike = {
  id?: SerializedId;
};

export type GroupChatLike = {
  participants?: ParticipantLike[];
};

export type ClientInfoLike = {
  wid?: SerializedId;
};

export type GroupMemberClientLike = {
  getChatById: (chatId: string) => Promise<unknown>;
};

export type BotInfoClientLike = {
  info?: ClientInfoLike | Promise<ClientInfoLike | undefined>;
};

function isValidStr(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value !== 'undefined';
}

export async function listNormalizedGroupMemberIds(
  client: GroupMemberClientLike,
  groupChatId: string
): Promise<string[]> {
  const chat = (await client.getChatById(groupChatId)) as GroupChatLike;
  const participants = Array.isArray(chat.participants) ? chat.participants : [];

  const groupMemberIds = participants
    .map((participant) => participant.id?._serialized)
    .filter((value): value is string => isValidStr(value))
    .map((value) => normalizeUserId(value));

  return Array.from(new Set(groupMemberIds));
}

export async function resolveNormalizedBotUserId(
  client: BotInfoClientLike
): Promise<string | null> {
  const info = await client.info;
  const botSerialized = info?.wid?._serialized;

  if (!isValidStr(botSerialized)) {
    return null;
  }

  return normalizeUserId(botSerialized);
}

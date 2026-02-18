import { normalizeUserId } from '../../app/normalizeUserId.js';

export type SerializedId = {
  _serialized?: string;
  user?: string;
  server?: string;
};

export type ParticipantLike = {
  id?: SerializedId;
  pn?: SerializedId;
  lid?: SerializedId;
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

function toNormalizedId(value: unknown): string | null {
  if (!isValidStr(value)) return null;
  return normalizeUserId(value);
}

function collectParticipantAliases(participant: ParticipantLike): string[] {
  const aliases = [
    toNormalizedId(participant.id?._serialized),
    toNormalizedId(participant.id?.user),
    toNormalizedId(participant.pn?._serialized),
    toNormalizedId(participant.pn?.user),
    toNormalizedId(participant.lid?._serialized),
    toNormalizedId(participant.lid?.user),
  ].filter((value): value is string => value !== null);

  return Array.from(new Set(aliases));
}

export type GroupMemberIdentity = {
  primaryId: string;
  aliases: string[];
};

export async function listGroupMemberIdentities(
  client: GroupMemberClientLike,
  groupChatId: string
): Promise<GroupMemberIdentity[]> {
  const chat = (await client.getChatById(groupChatId)) as GroupChatLike;
  const participants = Array.isArray(chat.participants) ? chat.participants : [];

  const identities: GroupMemberIdentity[] = [];

  for (const participant of participants) {
    const aliases = collectParticipantAliases(participant);
    if (aliases.length === 0) {
      continue;
    }

    identities.push({
      primaryId: aliases[0],
      aliases,
    });
  }

  return identities;
}

export async function listNormalizedGroupMemberIds(
  client: GroupMemberClientLike,
  groupChatId: string
): Promise<string[]> {
  const identities = await listGroupMemberIdentities(client, groupChatId);
  return Array.from(new Set(identities.map((identity) => identity.primaryId)));
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

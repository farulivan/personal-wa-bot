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
  getContactLidAndPhone?: (userIds: string[]) => Promise<Array<{ lid: string; pn: string }>>;
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

function collectParticipantSerializedIds(participant: ParticipantLike): string[] {
  const ids = [participant.id?._serialized, participant.pn?._serialized, participant.lid?._serialized]
    .filter((value): value is string => isValidStr(value))
    .filter((value) => value.includes('@'));

  return Array.from(new Set(ids));
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

  const linkedAliasesBySerializedId = new Map<string, Set<string>>();
  const serializedSeeds: string[] = [];

  for (const participant of participants) {
    const serializedIds = collectParticipantSerializedIds(participant);
    for (const serializedId of serializedIds) {
      if (!linkedAliasesBySerializedId.has(serializedId)) {
        linkedAliasesBySerializedId.set(serializedId, new Set([normalizeUserId(serializedId)]));
        serializedSeeds.push(serializedId);
      }
    }
  }

  if (serializedSeeds.length > 0 && client.getContactLidAndPhone) {
    try {
      const lidAndPhoneRows = await client.getContactLidAndPhone(serializedSeeds);

      for (let index = 0; index < serializedSeeds.length; index++) {
        const seed = serializedSeeds[index];
        const linked = linkedAliasesBySerializedId.get(seed);
        if (!linked) continue;

        const pair = lidAndPhoneRows[index];
        if (!pair) continue;

        const lid = toNormalizedId(pair.lid);
        if (lid) linked.add(lid);

        const pn = toNormalizedId(pair.pn);
        if (pn) linked.add(pn);
      }
    } catch {
      // Best-effort enrichment only. Fall back to participant fields.
    }
  }

  const identities: GroupMemberIdentity[] = [];

  for (const participant of participants) {
    const aliases = new Set<string>(collectParticipantAliases(participant));
    const serializedIds = collectParticipantSerializedIds(participant);

    for (const serializedId of serializedIds) {
      const linkedAliases = linkedAliasesBySerializedId.get(serializedId);
      if (!linkedAliases) continue;

      for (const alias of linkedAliases) {
        aliases.add(alias);
      }
    }

    const finalAliases = Array.from(aliases);
    if (finalAliases.length === 0) {
      continue;
    }

    identities.push({
      primaryId: finalAliases[0],
      aliases: finalAliases,
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

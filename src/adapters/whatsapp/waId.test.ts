import { describe, it, expect } from 'vitest';
import {
  listGroupMemberIdentities,
  type GroupMemberClientLike,
  type ParticipantLike,
} from './waId.js';

type FakeChat = { participants: ParticipantLike[] };

function makeClient(
  chat: FakeChat,
  getContactLidAndPhone?: GroupMemberClientLike['getContactLidAndPhone']
): GroupMemberClientLike {
  return {
    getChatById: async () => chat,
    getContactLidAndPhone,
  };
}

const participants: ParticipantLike[] = [
  { id: { _serialized: '628111@c.us', user: '628111' } },
  { id: { _serialized: '628222@c.us', user: '628222' } },
];

describe('listGroupMemberIdentities', () => {
  it('returns participant-only aliases when getContactLidAndPhone is unavailable', async () => {
    const client = makeClient({ participants });

    const identities = await listGroupMemberIdentities(client, 'group-1@g.us');

    expect(identities).toHaveLength(2);
    expect(identities[0].aliases).toEqual(['628111']);
    expect(identities[1].aliases).toEqual(['628222']);
  });

  it('enriches identities when getContactLidAndPhone returns rows aligned with seeds', async () => {
    const client = makeClient({ participants }, async () => [
      { lid: '111aaa@lid', pn: '628111@c.us' },
      { lid: '222bbb@lid', pn: '628222@c.us' },
    ]);

    const identities = await listGroupMemberIdentities(client, 'group-1@g.us');

    expect(identities).toHaveLength(2);
    expect(new Set(identities[0].aliases)).toEqual(new Set(['628111', '111aaa']));
    expect(new Set(identities[1].aliases)).toEqual(new Set(['628222', '222bbb']));
  });

  it('skips enrichment when getContactLidAndPhone returns fewer rows than seeds', async () => {
    // Without the length-mismatch guard, index-0's row would silently be applied
    // to seed 0 and seed 1 would inherit no enrichment. With the guard, both seeds
    // fall back to participant-only aliases — no risk of cross-attributing identities.
    const client = makeClient({ participants }, async () => [
      { lid: '111aaa@lid', pn: '628111@c.us' },
    ]);

    const identities = await listGroupMemberIdentities(client, 'group-1@g.us');

    expect(identities).toHaveLength(2);
    expect(identities[0].aliases).toEqual(['628111']);
    expect(identities[1].aliases).toEqual(['628222']);
    expect(identities[0].aliases).not.toContain('111aaa');
  });

  it('skips enrichment when getContactLidAndPhone returns more rows than seeds', async () => {
    const client = makeClient({ participants }, async () => [
      { lid: '111aaa@lid', pn: '628111@c.us' },
      { lid: '222bbb@lid', pn: '628222@c.us' },
      { lid: '333ccc@lid', pn: '628333@c.us' },
    ]);

    const identities = await listGroupMemberIdentities(client, 'group-1@g.us');

    expect(identities).toHaveLength(2);
    expect(identities[0].aliases).toEqual(['628111']);
    expect(identities[1].aliases).toEqual(['628222']);
  });
});

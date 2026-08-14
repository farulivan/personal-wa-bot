import { describe, it, expect, vi } from 'vitest';
import {
  BaileysGroupMembershipAdapter,
  resolveBotUserIdFrom,
  toGroupMemberIdentity,
} from './baileysGroupMembership.js';
import { createGroupMetadataCache, participantJids } from './groupMetadata.js';

const PN = '628111111111@s.whatsapp.net';
const LID = '199887766554433@lid';

describe('participantJids', () => {
  it('pairs a pn-primary participant with its lid complement', () => {
    expect(participantJids({ id: PN, lid: LID })).toEqual({ pnJid: PN, lidJid: LID });
  });

  it('pairs a lid-primary participant with its phoneNumber complement', () => {
    expect(participantJids({ id: LID, phoneNumber: PN })).toEqual({ pnJid: PN, lidJid: LID });
  });

  it('reports only the form it was given', () => {
    expect(participantJids({ id: LID })).toEqual({ pnJid: undefined, lidJid: LID });
    expect(participantJids({ id: PN })).toEqual({ pnJid: PN, lidJid: undefined });
  });

  it('treats an empty complement as absent', () => {
    expect(participantJids({ id: LID, phoneNumber: '' })).toEqual({
      pnJid: undefined,
      lidJid: LID,
    });
  });
});

describe('toGroupMemberIdentity', () => {
  it('uses the addressed form as primary and keeps both as aliases', () => {
    // A lid-addressed group keys members by lid, and so do our user rows.
    expect(toGroupMemberIdentity({ id: LID, phoneNumber: PN })).toEqual({
      primaryId: '199887766554433',
      aliases: ['628111111111', '199887766554433'],
    });
  });

  it('uses the phone number as primary in a pn-addressed group', () => {
    expect(toGroupMemberIdentity({ id: PN, lid: LID })).toEqual({
      primaryId: '628111111111',
      aliases: ['628111111111', '199887766554433'],
    });
  });

  it('falls back to the lid when a group withholds the phone number', () => {
    expect(toGroupMemberIdentity({ id: LID })).toEqual({
      primaryId: '199887766554433',
      aliases: ['199887766554433'],
    });
  });

  it('returns null for a participant with no usable id', () => {
    expect(toGroupMemberIdentity({ id: '' })).toBeNull();
  });
});

describe('resolveBotUserIdFrom', () => {
  it('reads the phone form directly when the bot is pn-addressed', () => {
    expect(resolveBotUserIdFrom({ id: PN })).toBe('628111111111');
  });

  it('prefers phoneNumber when the bot id is a lid', () => {
    expect(resolveBotUserIdFrom({ id: LID, phoneNumber: PN })).toBe('628111111111');
  });

  it('falls back to the lid when no phone number is known', () => {
    expect(resolveBotUserIdFrom({ id: LID })).toBe('199887766554433');
  });

  it('returns null before the socket has logged in', () => {
    expect(resolveBotUserIdFrom(undefined)).toBeNull();
  });
});

describe('BaileysGroupMembershipAdapter', () => {
  const GROUP = '120363000000000001@g.us';

  it('lists identities for every resolvable participant', async () => {
    const fetch = vi.fn().mockResolvedValue({
      addressingMode: 'lid',
      participants: [{ id: LID, phoneNumber: PN }, { id: '199000000000000@lid' }, { id: '' }],
    });
    const adapter = new BaileysGroupMembershipAdapter(fetch, () => ({ id: PN }));

    await expect(adapter.listMemberIdentities(GROUP)).resolves.toEqual([
      { primaryId: '199887766554433', aliases: ['628111111111', '199887766554433'] },
      { primaryId: '199000000000000', aliases: ['199000000000000'] },
    ]);
  });

  it('reads the bot id lazily, so a pre-login wiring still works', async () => {
    const botContact: { current?: { id: string } } = {};
    const adapter = new BaileysGroupMembershipAdapter(vi.fn(), () => botContact.current);

    await expect(adapter.resolveBotUserId()).resolves.toBeNull();

    botContact.current = { id: PN };
    await expect(adapter.resolveBotUserId()).resolves.toBe('628111111111');
  });
});

describe('createGroupMetadataCache', () => {
  const GROUP = '120363000000000001@g.us';
  const metadata = { addressingMode: 'pn', participants: [{ id: PN }] };

  it('fetches once inside the ttl', async () => {
    const fetch = vi.fn().mockResolvedValue(metadata);
    const cached = createGroupMetadataCache(fetch, 60_000, () => 1000);

    await cached(GROUP);
    await cached(GROUP);

    expect(fetch).toHaveBeenCalledOnce();
  });

  it('refetches once the ttl has passed', async () => {
    const fetch = vi.fn().mockResolvedValue(metadata);
    let now = 1000;
    const cached = createGroupMetadataCache(fetch, 60_000, () => now);

    await cached(GROUP);
    now += 60_001;
    await cached(GROUP);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps separate entries per group', async () => {
    const fetch = vi.fn().mockResolvedValue(metadata);
    const cached = createGroupMetadataCache(fetch, 60_000, () => 1000);

    await cached(GROUP);
    await cached('120363000000000002@g.us');

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

import { describe, it, expect } from 'vitest';
import {
  resolveSenderIdentity,
  toDbUserId,
  toDbUserIdCandidates,
} from './resolveSenderIdentity.js';
import type { WAMessageKey } from '@whiskeysockets/baileys';

const PN = '628111111111@s.whatsapp.net';
const LID = '199887766554433@lid';

function key(over: Partial<WAMessageKey>): WAMessageKey {
  return { remoteJid: '628111111111@s.whatsapp.net', fromMe: false, id: 'X', ...over };
}

describe('resolveSenderIdentity — direct messages', () => {
  it('reads a pn-addressed DM from remoteJid', () => {
    const id = resolveSenderIdentity(key({ remoteJid: PN, addressingMode: 'pn' }), false);

    expect(id.pnJid).toBe(PN);
    expect(id.lidJid).toBeUndefined();
  });

  it('pairs a pn-addressed DM with the lid alt', () => {
    const id = resolveSenderIdentity(
      key({ remoteJid: PN, remoteJidAlt: LID, addressingMode: 'pn' }),
      false
    );

    expect(id.pnJid).toBe(PN);
    expect(id.lidJid).toBe(LID);
  });

  it('reads a lid-addressed DM the other way round', () => {
    const id = resolveSenderIdentity(
      key({ remoteJid: LID, remoteJidAlt: PN, addressingMode: 'lid' }),
      false
    );

    expect(id.pnJid).toBe(PN);
    expect(id.lidJid).toBe(LID);
  });

  it('infers lid addressing when the mode is absent', () => {
    const id = resolveSenderIdentity(key({ remoteJid: LID, remoteJidAlt: PN }), false);

    expect(id.pnJid).toBe(PN);
    expect(id.lidJid).toBe(LID);
  });

  it('infers pn addressing when the mode is absent', () => {
    const id = resolveSenderIdentity(key({ remoteJid: PN }), false);

    expect(id.pnJid).toBe(PN);
    expect(id.lidJid).toBeUndefined();
  });
});

describe('resolveSenderIdentity — group messages', () => {
  const GROUP = '120363000000000001@g.us';

  it('reads the participant, not the group, as sender', () => {
    const id = resolveSenderIdentity(
      key({ remoteJid: GROUP, participant: PN, addressingMode: 'pn' }),
      true
    );

    expect(id.pnJid).toBe(PN);
    expect(id.rawJid).toBe(PN);
  });

  it('recovers the phone number from participantAlt in a lid group', () => {
    const id = resolveSenderIdentity(
      key({ remoteJid: GROUP, participant: LID, participantAlt: PN, addressingMode: 'lid' }),
      true
    );

    expect(id.pnJid).toBe(PN);
    expect(id.lidJid).toBe(LID);
  });

  it('reports only the lid when a lid group withholds the phone number', () => {
    const id = resolveSenderIdentity(
      key({ remoteJid: GROUP, participant: LID, addressingMode: 'lid' }),
      true
    );

    expect(id.pnJid).toBeUndefined();
    expect(id.lidJid).toBe(LID);
  });

  it('strips the device suffix from both forms', () => {
    const id = resolveSenderIdentity(
      key({
        remoteJid: GROUP,
        participant: '628111111111:12@s.whatsapp.net',
        participantAlt: '199887766554433:3@lid',
        addressingMode: 'pn',
      }),
      true
    );

    expect(id.pnJid).toBe(PN);
    expect(id.lidJid).toBe(LID);
  });

  it('tolerates a missing participant', () => {
    const id = resolveSenderIdentity(key({ remoteJid: GROUP, participant: undefined }), true);

    expect(id.pnJid).toBeUndefined();
    expect(id.lidJid).toBeUndefined();
    expect(id.rawJid).toBe('');
  });
});

describe('toDbUserId', () => {
  it('uses the addressed form, not the phone number, in a lid chat', () => {
    // ALLOWED_WA_IDS and users.id hold the WA ID, so the lid is the match.
    expect(toDbUserId({ pnJid: PN, lidJid: LID, rawJid: LID })).toBe('199887766554433');
  });

  it('uses the phone number when that is what addressed the sender', () => {
    expect(toDbUserId({ pnJid: PN, lidJid: LID, rawJid: PN })).toBe('628111111111');
  });

  it('falls back to a resolved form when there is no raw jid', () => {
    expect(toDbUserId({ lidJid: LID, rawJid: '' })).toBe('199887766554433');
  });

  it('normalizes a legacy @c.us raw jid', () => {
    expect(toDbUserId({ rawJid: '628111111111@c.us' })).toBe('628111111111');
  });

  it('reproduces the id whatsapp-web.js stored for a lid-addressed group', () => {
    const viaBaileys = toDbUserId(
      resolveSenderIdentity(
        key({
          remoteJid: '120363000000000001@g.us',
          participant: LID,
          participantAlt: PN,
          addressingMode: 'lid',
        }),
        true
      )
    );

    // whatsapp-web.js wrote msg.author through verbatim: "…@lid" -> the lid.
    expect(viaBaileys).toBe('199887766554433');
  });
});

describe('toDbUserIdCandidates', () => {
  it('lists the addressed form first, then the alternate', () => {
    expect(toDbUserIdCandidates({ pnJid: PN, lidJid: LID, rawJid: LID })).toEqual([
      '199887766554433',
      '628111111111',
    ]);
  });

  it('deduplicates when the forms collapse to one id', () => {
    expect(toDbUserIdCandidates({ pnJid: PN, rawJid: PN })).toEqual(['628111111111']);
  });

  it('drops empty forms', () => {
    expect(toDbUserIdCandidates({ rawJid: '' })).toEqual([]);
  });
});

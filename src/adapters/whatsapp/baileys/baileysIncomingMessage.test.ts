import { describe, it, expect } from 'vitest';
import type { WAMessage } from '@whiskeysockets/baileys';
import { extractText, toIncomingMessage } from './baileysIncomingMessage.js';

const GROUP = '120363000000000001@g.us';
const PN = '628111111111@s.whatsapp.net';
const LID = '199887766554433@lid';
const BOT_PN = '628999999999@s.whatsapp.net';
const BOT_LID = '199000000000000@lid';

const BOT = { pnJid: BOT_PN, lidJid: BOT_LID };

function makeMessage(over: {
  remoteJid?: string;
  participant?: string;
  participantAlt?: string;
  addressingMode?: string;
  fromMe?: boolean;
  pushName?: string;
  message?: WAMessage['message'];
}): WAMessage {
  return {
    key: {
      remoteJid: 'remoteJid' in over ? over.remoteJid : PN,
      fromMe: over.fromMe ?? false,
      id: 'MSGID',
      participant: over.participant,
      participantAlt: over.participantAlt,
      addressingMode: over.addressingMode,
    },
    pushName: over.pushName,
    message: over.message ?? { conversation: '#workout list' },
  } as WAMessage;
}

describe('extractText', () => {
  it('reads a bare conversation', () => {
    expect(extractText(makeMessage({ message: { conversation: 'hi' } }))).toBe('hi');
  });

  it('reads an extended text message', () => {
    expect(
      extractText(makeMessage({ message: { extendedTextMessage: { text: 'hi there' } } }))
    ).toBe('hi there');
  });

  it('unwraps an ephemeral message', () => {
    expect(
      extractText(
        makeMessage({
          message: { ephemeralMessage: { message: { conversation: 'disappearing' } } },
        })
      )
    ).toBe('disappearing');
  });

  it('returns empty for content it does not handle', () => {
    expect(extractText(makeMessage({ message: { imageMessage: {} } }))).toBe('');
  });
});

describe('toIncomingMessage — messages the bot ignores', () => {
  it('skips its own messages', () => {
    expect(toIncomingMessage(makeMessage({ fromMe: true }), BOT)).toBeNull();
  });

  it('skips messages with no text', () => {
    expect(toIncomingMessage(makeMessage({ message: { imageMessage: {} } }), BOT)).toBeNull();
  });

  it('skips whitespace-only text', () => {
    expect(toIncomingMessage(makeMessage({ message: { conversation: '   ' } }), BOT)).toBeNull();
  });

  it('skips a message with no chat id', () => {
    expect(toIncomingMessage(makeMessage({ remoteJid: undefined }), BOT)).toBeNull();
  });
});

describe('toIncomingMessage — direct messages', () => {
  it('maps a pn-addressed DM', () => {
    const msg = toIncomingMessage(makeMessage({ remoteJid: PN, pushName: 'Rani' }), BOT);

    expect(msg?.chatId).toBe(PN);
    expect(msg?.isGroup).toBe(false);
    expect(msg?.senderId).toBe('628111111111');
    expect(msg?.text).toBe('#workout list');
  });

  it('exposes pushName and no contactName, since there is no address book', async () => {
    const msg = toIncomingMessage(makeMessage({ remoteJid: PN, pushName: 'Rani' }), BOT);

    await expect(msg?.getContact()).resolves.toEqual({
      phoneNumber: '628111111111',
      contactName: undefined,
      pushname: 'Rani',
    });
  });
});

describe('toIncomingMessage — group messages', () => {
  it('takes the sender from the participant, not the group', () => {
    const msg = toIncomingMessage(
      makeMessage({ remoteJid: GROUP, participant: PN, addressingMode: 'pn' }),
      BOT
    );

    expect(msg?.isGroup).toBe(true);
    expect(msg?.chatId).toBe(GROUP);
    expect(msg?.senderId).toBe('628111111111');
  });

  it('keys a lid-addressed group message by the lid, matching stored rows', () => {
    const msg = toIncomingMessage(
      makeMessage({
        remoteJid: GROUP,
        participant: LID,
        participantAlt: PN,
        addressingMode: 'lid',
      }),
      BOT
    );

    // users.id and ALLOWED_WA_IDS hold the WA ID that whatsapp-web.js wrote
    // through from msg.author. Using the phone number here would orphan every
    // existing row and make the allowlist reject the whole family.
    expect(msg?.senderId).toBe('199887766554433');
    expect(msg?.senderCandidates).toEqual(['199887766554433', '628111111111']);
  });

  it('falls back to the lid when a lid group withholds the phone number', async () => {
    const msg = toIncomingMessage(
      makeMessage({ remoteJid: GROUP, participant: LID, addressingMode: 'lid' }),
      BOT
    );

    expect(msg?.senderId).toBe('199887766554433');
    await expect(msg?.getContact()).resolves.toMatchObject({ phoneNumber: undefined });
  });

  it('normalizes a device-suffixed sender', () => {
    const msg = toIncomingMessage(
      makeMessage({
        remoteJid: GROUP,
        participant: '628111111111:12@s.whatsapp.net',
        addressingMode: 'pn',
      }),
      BOT
    );

    expect(msg?.senderId).toBe('628111111111');
  });
});

describe('toIncomingMessage — bot mentions', () => {
  function withMentions(mentionedJid: string[]): WAMessage {
    return makeMessage({
      remoteJid: GROUP,
      participant: PN,
      addressingMode: 'pn',
      message: {
        extendedTextMessage: { text: '@628999999999 hi', contextInfo: { mentionedJid } },
      },
    });
  }

  it('detects the bot mentioned by its phone JID', async () => {
    const msg = toIncomingMessage(withMentions([BOT_PN]), BOT);
    await expect(msg?.isBotMentioned()).resolves.toBe(true);
  });

  it('detects the bot mentioned by its lid JID', async () => {
    const msg = toIncomingMessage(withMentions([BOT_LID]), BOT);
    await expect(msg?.isBotMentioned()).resolves.toBe(true);
  });

  it('does not fire when someone else is mentioned', async () => {
    const msg = toIncomingMessage(withMentions([PN]), BOT);
    await expect(msg?.isBotMentioned()).resolves.toBe(false);
  });

  it('does not fire when there are no mentions at all', async () => {
    const msg = toIncomingMessage(
      makeMessage({ remoteJid: GROUP, participant: PN, addressingMode: 'pn' }),
      BOT
    );
    await expect(msg?.isBotMentioned()).resolves.toBe(false);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { createIncomingMessageMapper } from './wwebjsMessage.js';

const BOT_SERIALIZED = '628999@c.us';

function makeClient(botSerialized: string | undefined = BOT_SERIALIZED) {
  return { info: Promise.resolve({ wid: { _serialized: botSerialized } }) };
}

function makeMsg(overrides: {
  body?: string;
  from: string;
  author?: string;
  mentions?: { id: { _serialized: string } }[];
}) {
  return {
    body: overrides.body ?? 'hi',
    from: overrides.from,
    author: overrides.author,
    getContact: vi.fn().mockResolvedValue({
      number: '628111',
      name: 'Saved Name',
      pushname: 'Push Name',
    }),
    getMentions: vi.fn().mockResolvedValue(overrides.mentions ?? []),
    getChat: vi.fn().mockResolvedValue({ sendMessage: vi.fn() }),
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe('createIncomingMessageMapper', () => {
  it('maps a direct message', () => {
    const map = createIncomingMessageMapper(makeClient());
    const msg = map(makeMsg({ body: '#workout list', from: '628111@c.us' }) as never);

    expect(msg.chatId).toBe('628111@c.us');
    expect(msg.isGroup).toBe(false);
    expect(msg.senderId).toBe('628111');
    expect(msg.text).toBe('#workout list');
  });

  it('prefers the author over the chat id as sender in a group', () => {
    const map = createIncomingMessageMapper(makeClient());
    const msg = map(makeMsg({ from: '120363000@g.us', author: '628111@c.us' }) as never);

    expect(msg.isGroup).toBe(true);
    expect(msg.chatId).toBe('120363000@g.us');
    expect(msg.senderId).toBe('628111');
  });

  it('does not resolve the contact until getContact is called', async () => {
    const map = createIncomingMessageMapper(makeClient());
    const raw = makeMsg({ from: '628111@c.us' });
    const msg = map(raw as never);

    expect(raw.getContact).not.toHaveBeenCalled();

    await expect(msg.getContact()).resolves.toEqual({
      phoneNumber: '628111',
      contactName: 'Saved Name',
      pushname: 'Push Name',
    });
    expect(raw.getContact).toHaveBeenCalledOnce();
  });

  it('does not resolve mentions until isBotMentioned is called', async () => {
    const map = createIncomingMessageMapper(makeClient());
    const raw = makeMsg({ from: '120363000@g.us' });
    const msg = map(raw as never);

    expect(raw.getMentions).not.toHaveBeenCalled();

    await msg.isBotMentioned();
    expect(raw.getMentions).toHaveBeenCalledOnce();
  });

  it('reports the bot as mentioned when its id is among the mentions', async () => {
    const map = createIncomingMessageMapper(makeClient());
    const msg = map(
      makeMsg({
        from: '120363000@g.us',
        mentions: [{ id: { _serialized: BOT_SERIALIZED } }],
      }) as never
    );

    await expect(msg.isBotMentioned()).resolves.toBe(true);
  });

  it('reports the bot as not mentioned when someone else is tagged', async () => {
    const map = createIncomingMessageMapper(makeClient());
    const msg = map(
      makeMsg({
        from: '120363000@g.us',
        mentions: [{ id: { _serialized: '628111@c.us' } }],
      }) as never
    );

    await expect(msg.isBotMentioned()).resolves.toBe(false);
  });

  it('exposes the chat and reply fallbacks in order', async () => {
    const map = createIncomingMessageMapper(makeClient());
    const raw = makeMsg({ from: '628111@c.us' });
    const msg = map(raw as never);

    expect(msg.replyFallbacks?.map((f) => f.name)).toEqual(['chat.sendMessage', 'msg.reply']);

    await msg.replyFallbacks?.[1].send('fallback text');
    expect(raw.reply).toHaveBeenCalledWith('fallback text');
  });
});

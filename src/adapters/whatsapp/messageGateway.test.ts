import { describe, it, expect, vi } from 'vitest';
import { createMessageGateway } from './messageGateway.js';
import type { IncomingMessage } from './ports.js';

function makeGateway(sendMessageFn = vi.fn().mockResolvedValue(undefined)) {
  const client = { sendMessage: sendMessageFn };
  const gateway = createMessageGateway(client);
  return { gateway, sendMessageFn };
}

function makeFakeMessage(chatId: string, fallbacks: IncomingMessage['replyFallbacks'] = []) {
  return {
    chatId,
    isGroup: chatId.endsWith('@g.us'),
    senderId: '628111',
    text: 'irrelevant',
    getContact: vi.fn().mockResolvedValue({}),
    isBotMentioned: vi.fn().mockResolvedValue(false),
    replyFallbacks: fallbacks,
  } satisfies IncomingMessage;
}

describe('MessageGateway.sendMessage — group-chat guard', () => {
  it('strips mentions for direct chat (non-@g.us)', async () => {
    const { gateway, sendMessageFn } = makeGateway();

    await gateway.sendMessage('123@c.us', 'hi', ['456']);

    expect(sendMessageFn).toHaveBeenCalledWith('123@c.us', 'hi', { sendSeen: false });
    expect(sendMessageFn.mock.calls[0][2]).not.toHaveProperty('mentions');
  });

  it('builds mention JIDs from phone numbers for group chat (@g.us)', async () => {
    const { gateway, sendMessageFn } = makeGateway();

    await gateway.sendMessage('120-1@g.us', 'hi', ['456']);

    expect(sendMessageFn).toHaveBeenCalledWith('120-1@g.us', 'hi', {
      sendSeen: false,
      mentions: ['456@c.us'],
    });
  });

  it('omits mentions for group chat when mentions array is empty', async () => {
    const { gateway, sendMessageFn } = makeGateway();

    await gateway.sendMessage('120-1@g.us', 'hi', []);

    expect(sendMessageFn).toHaveBeenCalledWith('120-1@g.us', 'hi', { sendSeen: false });
    expect(sendMessageFn.mock.calls[0][2]).not.toHaveProperty('mentions');
  });

  it('omits mentions for group chat when no mentions arg passed', async () => {
    const { gateway, sendMessageFn } = makeGateway();

    await gateway.sendMessage('120-1@g.us', 'hi');

    expect(sendMessageFn).toHaveBeenCalledWith('120-1@g.us', 'hi', { sendSeen: false });
    expect(sendMessageFn.mock.calls[0][2]).not.toHaveProperty('mentions');
  });
});

describe('MessageGateway.reply — group-chat guard', () => {
  it('strips mentions for direct chat (non-@g.us)', async () => {
    const { gateway, sendMessageFn } = makeGateway();
    const msg = makeFakeMessage('123@c.us');

    await gateway.reply(msg as never, 'hi', ['456']);

    expect(sendMessageFn).toHaveBeenCalledWith('123@c.us', 'hi', { sendSeen: false });
    expect(sendMessageFn.mock.calls[0][2]).not.toHaveProperty('mentions');
  });

  it('builds mention JIDs from phone numbers for group chat (@g.us)', async () => {
    const { gateway, sendMessageFn } = makeGateway();
    const msg = makeFakeMessage('120-1@g.us');

    await gateway.reply(msg as never, 'hi', ['456']);

    expect(sendMessageFn).toHaveBeenCalledWith('120-1@g.us', 'hi', {
      sendSeen: false,
      mentions: ['456@c.us'],
    });
  });

  it('omits mentions for group chat when mentions array is empty', async () => {
    const { gateway, sendMessageFn } = makeGateway();
    const msg = makeFakeMessage('120-1@g.us');

    await gateway.reply(msg as never, 'hi', []);

    expect(sendMessageFn).toHaveBeenCalledWith('120-1@g.us', 'hi', { sendSeen: false });
    expect(sendMessageFn.mock.calls[0][2]).not.toHaveProperty('mentions');
  });

  it('omits mentions for group chat when no mentions arg passed', async () => {
    const { gateway, sendMessageFn } = makeGateway();
    const msg = makeFakeMessage('120-1@g.us');

    await gateway.reply(msg as never, 'hi');

    expect(sendMessageFn).toHaveBeenCalledWith('120-1@g.us', 'hi', { sendSeen: false });
    expect(sendMessageFn.mock.calls[0][2]).not.toHaveProperty('mentions');
  });
});

describe('MessageGateway.reply — fallback ladder', () => {
  it('does not touch fallbacks when the primary send succeeds', async () => {
    const { gateway } = makeGateway();
    const first = vi.fn().mockResolvedValue(undefined);
    const msg = makeFakeMessage('123@c.us', [{ name: 'first', send: first }]);

    await gateway.reply(msg as never, 'hi');

    expect(first).not.toHaveBeenCalled();
  });

  it('falls through to the next fallback until one succeeds', async () => {
    const { gateway } = makeGateway(vi.fn().mockRejectedValue(new Error('primary down')));
    const first = vi.fn().mockRejectedValue(new Error('first down'));
    const second = vi.fn().mockResolvedValue(undefined);
    const msg = makeFakeMessage('123@c.us', [
      { name: 'first', send: first },
      { name: 'second', send: second },
    ]);

    await gateway.reply(msg as never, 'hi');

    expect(first).toHaveBeenCalledWith('hi');
    expect(second).toHaveBeenCalledWith('hi');
  });

  it('stops at the first fallback that succeeds', async () => {
    const { gateway } = makeGateway(vi.fn().mockRejectedValue(new Error('primary down')));
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const msg = makeFakeMessage('123@c.us', [
      { name: 'first', send: first },
      { name: 'second', send: second },
    ]);

    await gateway.reply(msg as never, 'hi');

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it('resolves without throwing when every path fails', async () => {
    const { gateway } = makeGateway(vi.fn().mockRejectedValue(new Error('primary down')));
    const msg = makeFakeMessage('123@c.us', [
      { name: 'first', send: vi.fn().mockRejectedValue(new Error('first down')) },
    ]);

    await expect(gateway.reply(msg as never, 'hi')).resolves.toBeUndefined();
  });

  it('resolves without throwing when the transport has no fallbacks', async () => {
    const { gateway } = makeGateway(vi.fn().mockRejectedValue(new Error('primary down')));
    const msg = makeFakeMessage('123@c.us');

    await expect(gateway.reply(msg as never, 'hi')).resolves.toBeUndefined();
  });
});

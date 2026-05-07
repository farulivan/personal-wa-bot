import { describe, it, expect, vi } from 'vitest';
import { createMessageGateway } from './messageGateway.js';

type FakeMessage = {
  from: string;
  getChat: () => Promise<{ sendMessage: ReturnType<typeof vi.fn> }>;
  reply: ReturnType<typeof vi.fn>;
};

function makeGateway() {
  const sendMessageFn = vi.fn().mockResolvedValue(undefined);
  const client = { sendMessage: sendMessageFn };
  const gateway = createMessageGateway(client);
  return { gateway, sendMessageFn };
}

function makeFakeMessage(from: string): FakeMessage {
  return {
    from,
    getChat: vi.fn().mockResolvedValue({ sendMessage: vi.fn() }),
    reply: vi.fn(),
  };
}

describe('MessageGateway.sendMessage — group-chat guard', () => {
  it('strips mentions for direct chat (non-@g.us)', async () => {
    const { gateway, sendMessageFn } = makeGateway();

    await gateway.sendMessage('123@c.us', 'hi', ['456@c.us']);

    expect(sendMessageFn).toHaveBeenCalledWith('123@c.us', 'hi', { sendSeen: false });
    expect(sendMessageFn.mock.calls[0][2]).not.toHaveProperty('mentions');
  });

  it('passes mentions for group chat (@g.us)', async () => {
    const { gateway, sendMessageFn } = makeGateway();

    await gateway.sendMessage('120-1@g.us', 'hi', ['456@c.us']);

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

    await gateway.reply(msg as never, 'hi', ['456@c.us']);

    expect(sendMessageFn).toHaveBeenCalledWith('123@c.us', 'hi', { sendSeen: false });
    expect(sendMessageFn.mock.calls[0][2]).not.toHaveProperty('mentions');
  });

  it('passes mentions for group chat (@g.us)', async () => {
    const { gateway, sendMessageFn } = makeGateway();
    const msg = makeFakeMessage('120-1@g.us');

    await gateway.reply(msg as never, 'hi', ['456@c.us']);

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

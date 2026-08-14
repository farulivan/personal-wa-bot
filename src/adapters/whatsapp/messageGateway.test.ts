import { describe, it, expect, vi } from 'vitest';
import { createMessageGateway } from './messageGateway.js';
import type { IncomingMessage } from './ports.js';

function makeGateway(sendMessage = vi.fn().mockResolvedValue(undefined)) {
  return { gateway: createMessageGateway({ sendMessage }), sendMessage };
}

function makeFakeMessage(chatId: string): IncomingMessage {
  return {
    chatId,
    isGroup: chatId.endsWith('@g.us'),
    senderId: '628111',
    text: 'irrelevant',
    getContact: vi.fn().mockResolvedValue({}),
    isBotMentioned: vi.fn().mockResolvedValue(false),
  };
}

describe('MessageGateway.sendMessage', () => {
  it('passes the chat id, text and mention numbers straight through', async () => {
    const { gateway, sendMessage } = makeGateway();

    await gateway.sendMessage('120-1@g.us', 'hi', ['628111']);

    expect(sendMessage).toHaveBeenCalledWith('120-1@g.us', 'hi', ['628111']);
  });

  it('passes undefined when there are no mentions', async () => {
    const { gateway, sendMessage } = makeGateway();

    await gateway.sendMessage('120-1@g.us', 'hi');

    expect(sendMessage).toHaveBeenCalledWith('120-1@g.us', 'hi', undefined);
  });

  it('propagates a send failure to the caller', async () => {
    const { gateway } = makeGateway(vi.fn().mockRejectedValue(new Error('socket down')));

    await expect(gateway.sendMessage('120-1@g.us', 'hi')).rejects.toThrow('socket down');
  });
});

describe('MessageGateway.reply', () => {
  it('sends to the chat the message arrived in', async () => {
    const { gateway, sendMessage } = makeGateway();

    await gateway.reply(makeFakeMessage('120-1@g.us'), 'hi', ['628111']);

    expect(sendMessage).toHaveBeenCalledWith('120-1@g.us', 'hi', ['628111']);
  });

  it('swallows a send failure, so one bad reply cannot stop the message loop', async () => {
    const { gateway } = makeGateway(vi.fn().mockRejectedValue(new Error('socket down')));

    await expect(gateway.reply(makeFakeMessage('123@c.us'), 'hi')).resolves.toBeUndefined();
  });
});

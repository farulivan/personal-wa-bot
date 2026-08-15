import { describe, it, expect, vi } from 'vitest';
import { createMessageHandler } from './messageHandler.js';
import type { CommandRouter } from './commandRouter.js';
import type { CommandInvocation } from './parseCommand.js';
import type { RichReply } from './commandRouter.js';
import { toPhoneNumber, toWaUserId } from '../shared/identity.js';
import type { WaUserId } from '../shared/identity.js';

// Minimal stub for a transport-neutral IncomingMessage
function makeMsg(overrides: {
  body: string;
  from: string;
  author?: string;
  botMentioned?: boolean;
  senderCandidates?: string[];
}): {
  chatId: string;
  isGroup: boolean;
  senderId: WaUserId;
  senderCandidates: WaUserId[];
  text: string;
  getContact: ReturnType<typeof vi.fn>;
  isBotMentioned: ReturnType<typeof vi.fn>;
} {
  const chatId = overrides.from;
  const senderId = (overrides.author ?? chatId).replace(/@(c\.us|lid|g\.us)$/, '');
  return {
    chatId,
    isGroup: chatId.endsWith('@g.us'),
    senderId: toWaUserId(senderId),
    senderCandidates: (overrides.senderCandidates ?? [senderId]).map(toWaUserId),
    text: overrides.body,
    getContact: vi.fn().mockResolvedValue({
      phoneNumber: '628111',
      contactName: 'Test User',
      pushname: 'Test',
    }),
    isBotMentioned: vi.fn().mockResolvedValue(overrides.botMentioned ?? false),
  };
}

function makeAppContext(isAllowed: boolean) {
  return {
    config: { userTimezoneOffsetMinutes: 420 },
    messageGateway: {
      reply: vi.fn().mockResolvedValue(undefined),
    },
    userService: {
      captureIfNew: vi.fn().mockResolvedValue(undefined),
    },
    isAllowedUser: vi.fn().mockReturnValue(isAllowed),
  };
}

function makeRouter(): CommandRouter & { route: ReturnType<typeof vi.fn> } {
  return {
    route: vi.fn().mockResolvedValue(null),
    registerNamespace: vi.fn(),
  } as unknown as CommandRouter & { route: ReturnType<typeof vi.fn> };
}

const DM_FROM = '628111@c.us';
const GROUP_FROM = '628000@g.us';
const ALLOWED_AUTHOR = '628111@c.us';

describe('createMessageHandler', () => {
  describe('1. non-allowed DM #workout list', () => {
    it('blocks before any IPC or routing', async () => {
      const appContext = makeAppContext(false);
      const router = makeRouter();
      const handle = createMessageHandler(router as unknown as CommandRouter, appContext as never);
      const msg = makeMsg({ body: '#workout list', from: DM_FROM });

      await handle(msg as never);

      expect(msg.getContact).not.toHaveBeenCalled();
      expect(appContext.userService.captureIfNew).not.toHaveBeenCalled();
      expect(msg.isBotMentioned).not.toHaveBeenCalled();
      expect(router.route).not.toHaveBeenCalled();
    });
  });

  describe('2. non-allowed group @<bot> #workout list', () => {
    it('blocks before any IPC or routing', async () => {
      const appContext = makeAppContext(false);
      const router = makeRouter();
      const handle = createMessageHandler(router as unknown as CommandRouter, appContext as never);
      const msg = makeMsg({
        body: '@628999 #workout list',
        from: GROUP_FROM,
        author: '628999blocked@c.us',
      });

      await handle(msg as never);

      expect(msg.getContact).not.toHaveBeenCalled();
      expect(appContext.userService.captureIfNew).not.toHaveBeenCalled();
      expect(msg.isBotMentioned).not.toHaveBeenCalled();
      expect(router.route).not.toHaveBeenCalled();
    });
  });

  describe('2b. sender allowed under an alternate identity form', () => {
    it('admits them when any candidate is on the allowlist', async () => {
      const appContext = makeAppContext(false);
      // Allowlist holds the WA ID; this chat is addressing them the other way.
      appContext.isAllowedUser.mockImplementation((id: string) => id === '199887766554433');
      const router = makeRouter();
      router.route.mockResolvedValue('result');
      const handle = createMessageHandler(router as unknown as CommandRouter, appContext as never);
      const msg = makeMsg({
        body: '#workout list',
        from: GROUP_FROM,
        author: '628111111111@s.whatsapp.net',
        senderCandidates: ['628111111111', '199887766554433'],
      });

      await handle(msg as never);

      expect(router.route).toHaveBeenCalledOnce();
    });

    it('still blocks when no candidate is on the allowlist', async () => {
      const appContext = makeAppContext(false);
      const router = makeRouter();
      const handle = createMessageHandler(router as unknown as CommandRouter, appContext as never);
      const msg = makeMsg({
        body: '#workout list',
        from: GROUP_FROM,
        author: '628999999999@s.whatsapp.net',
        senderCandidates: ['628999999999', '199000000000000'],
      });

      await handle(msg as never);

      expect(router.route).not.toHaveBeenCalled();
      expect(msg.getContact).not.toHaveBeenCalled();
    });
  });

  describe('3. allowed group ordinary chatter "lunch?"', () => {
    it('skips the mention lookup, captureIfNew, and routing', async () => {
      const appContext = makeAppContext(true);
      const router = makeRouter();
      const handle = createMessageHandler(router as unknown as CommandRouter, appContext as never);
      const msg = makeMsg({ body: 'lunch?', from: GROUP_FROM, author: ALLOWED_AUTHOR });

      await handle(msg as never);

      expect(msg.isBotMentioned).not.toHaveBeenCalled();
      expect(appContext.userService.captureIfNew).not.toHaveBeenCalled();
      expect(router.route).not.toHaveBeenCalled();
    });
  });

  describe('4. allowed group #workout list (no mention)', () => {
    it('routes correctly without looking up mentions', async () => {
      const appContext = makeAppContext(true);
      const router = makeRouter();
      router.route.mockResolvedValue('result');
      const handle = createMessageHandler(router as unknown as CommandRouter, appContext as never);
      const msg = makeMsg({ body: '#workout list', from: GROUP_FROM, author: ALLOWED_AUTHOR });

      await handle(msg as never);

      expect(msg.isBotMentioned).not.toHaveBeenCalled();
      expect(router.route).toHaveBeenCalledOnce();
      const invocation = router.route.mock.calls[0][1] as CommandInvocation;
      expect(invocation.namespace).toBe('workout');
      expect(invocation.subcommand).toBe('list');
    });
  });

  describe('5. allowed group @628111 #workout list (with mention)', () => {
    it('resolves the mention, strips it, and routes with the correct invocation', async () => {
      const appContext = makeAppContext(true);
      const router = makeRouter();
      router.route.mockResolvedValue('result');
      const handle = createMessageHandler(router as unknown as CommandRouter, appContext as never);
      const msg = makeMsg({
        body: '@628999 #workout list',
        from: GROUP_FROM,
        author: ALLOWED_AUTHOR,
        botMentioned: true,
      });

      await handle(msg as never);

      expect(msg.isBotMentioned).toHaveBeenCalledOnce();
      expect(router.route).toHaveBeenCalledOnce();
      const invocation = router.route.mock.calls[0][1] as CommandInvocation;
      expect(invocation.namespace).toBe('workout');
      expect(invocation.subcommand).toBe('list');
    });
  });

  describe('6. allowed group @628111 hi (greeting with mention)', () => {
    it('resolves the mention, sends a greeting reply, does not route', async () => {
      const appContext = makeAppContext(true);
      const router = makeRouter();
      const handle = createMessageHandler(router as unknown as CommandRouter, appContext as never);
      const msg = makeMsg({
        body: '@628999 hi',
        from: GROUP_FROM,
        author: ALLOWED_AUTHOR,
        botMentioned: true,
      });

      await handle(msg as never);

      expect(msg.isBotMentioned).toHaveBeenCalledOnce();
      expect(appContext.messageGateway.reply).toHaveBeenCalledOnce();
      expect(router.route).not.toHaveBeenCalled();
    });
  });

  describe('7. allowed DM #workout list', () => {
    it('routes correctly without looking up mentions', async () => {
      const appContext = makeAppContext(true);
      const router = makeRouter();
      router.route.mockResolvedValue('result');
      const handle = createMessageHandler(router as unknown as CommandRouter, appContext as never);
      const msg = makeMsg({ body: '#workout list', from: DM_FROM });

      await handle(msg as never);

      expect(msg.isBotMentioned).not.toHaveBeenCalled();
      expect(router.route).toHaveBeenCalledOnce();
      const invocation = router.route.mock.calls[0][1] as CommandInvocation;
      expect(invocation.namespace).toBe('workout');
      expect(invocation.subcommand).toBe('list');
    });
  });

  describe('8. allowed DM plain hello', () => {
    it('does not route and does not send a greeting reply', async () => {
      const appContext = makeAppContext(true);
      const router = makeRouter();
      const handle = createMessageHandler(router as unknown as CommandRouter, appContext as never);
      const msg = makeMsg({ body: 'hello', from: DM_FROM });

      await handle(msg as never);

      expect(router.route).not.toHaveBeenCalled();
      expect(appContext.messageGateway.reply).not.toHaveBeenCalled();
    });
  });

  describe('9. route returns string → gateway called with 2 args', () => {
    it('calls reply(msg, text) without a mentions argument', async () => {
      const appContext = makeAppContext(true);
      const router = makeRouter();
      router.route.mockResolvedValue('hello there');
      const handle = createMessageHandler(router as unknown as CommandRouter, appContext as never);
      const msg = makeMsg({ body: '#workout list', from: DM_FROM });

      await handle(msg as never);

      expect(appContext.messageGateway.reply).toHaveBeenCalledOnce();
      expect(appContext.messageGateway.reply).toHaveBeenCalledWith(msg, 'hello there');
    });
  });

  describe('10. route returns RichReply → gateway called with 3 args', () => {
    it('calls reply(msg, text, mentions) when result is RichReply', async () => {
      const appContext = makeAppContext(true);
      const router = makeRouter();
      const rich: RichReply = {
        text: 'Heads up @628111',
        mentions: [toPhoneNumber('628111')],
      };
      router.route.mockResolvedValue(rich);
      const handle = createMessageHandler(router as unknown as CommandRouter, appContext as never);
      const msg = makeMsg({
        body: '#workout leaderboard',
        from: GROUP_FROM,
        author: ALLOWED_AUTHOR,
      });

      await handle(msg as never);

      expect(appContext.messageGateway.reply).toHaveBeenCalledOnce();
      expect(appContext.messageGateway.reply).toHaveBeenCalledWith(msg, 'Heads up @628111', [
        '628111',
      ]);
    });
  });
});

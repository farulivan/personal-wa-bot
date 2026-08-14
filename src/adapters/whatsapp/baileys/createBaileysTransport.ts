import fs from 'fs';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { debug, error, log, rootLogger } from '../../../logger.js';
import { handleDisconnect } from '../../../processGuards.js';
import type { GroupMembershipPort, IncomingMessage, MessageSenderPort } from '../ports.js';
import { toIncomingMessage } from './baileysIncomingMessage.js';
import { createBaileysMessageSender } from './baileysMessageSender.js';
import { BaileysGroupMembershipAdapter } from './baileysGroupMembership.js';
import { createGroupMetadataCache } from './groupMetadata.js';
import { decideReconnect } from './reconnectPolicy.js';

/** A socket stuck short of 'open' this long is wedged in a way the ladder cannot see. */
const STALL_TIMEOUT_MS = 10 * 60_000;

export type BaileysTransport = {
  senderPort: MessageSenderPort;
  membershipPort: GroupMembershipPort;
  /** True only while the socket is open. Schedulers gate their sends on this. */
  isConnected: () => boolean;
  /** Begins connecting. Resolves once the first socket has been constructed. */
  start: () => Promise<void>;
  /** Stops the ladder and closes the socket without triggering a reconnect. */
  stop: () => void;
};

export type BaileysTransportDeps = {
  authDir: string;
  logLevel?: string;
  onMessage: (msg: IncomingMessage) => Promise<void>;
  onReady: () => void;
};

function renderQr(qr: string): void {
  log('\n📱 Scan this QR code with WhatsApp:\n');
  qrcode.generate(qr, { small: true });
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
  log('\n🔗 Or open this URL to scan the QR code:');
  log(qrUrl);
  log('\n');
}

function wipeAuthDir(authDir: string): void {
  try {
    fs.rmSync(authDir, { recursive: true, force: true });
    log({ authDir }, 'cleared the wa session so the next boot can pair again');
  } catch (err) {
    error({ err, authDir }, 'failed to clear the wa session');
  }
}

export function createBaileysTransport(deps: BaileysTransportDeps): BaileysTransport {
  const waLogger = rootLogger.child({ component: 'baileys' }, { level: deps.logLevel ?? 'warn' });

  let socket: WASocket | undefined;
  let connected = false;
  let stopping = false;
  let consecutiveFailures = 0;
  let consecutiveRestartRequired = 0;
  let stallTimer: NodeJS.Timeout | undefined;

  function armStallWatchdog(): void {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      if (!connected && !stopping) {
        handleDisconnect(`no connection for ${STALL_TIMEOUT_MS}ms`);
      }
    }, STALL_TIMEOUT_MS);
    stallTimer.unref();
  }

  // Reads through to the live socket so the ports keep working across
  // reconnects — the socket object is replaced, the ports are not.
  const fetchGroupMetadata = createGroupMetadataCache(async (groupId) => {
    if (!socket) {
      throw new Error('whatsapp socket is not connected');
    }
    return socket.groupMetadata(groupId);
  });

  const senderPort = createBaileysMessageSender(
    async (jid, content) => {
      if (!socket || !connected) {
        throw new Error('whatsapp socket is not connected');
      }
      return socket.sendMessage(jid, content);
    },
    fetchGroupMetadata,
    // Baileys keeps its own PN↔LID mapping, populated as it discovers pairs.
    // It is the authority when a group's participant row omits the lid.
    (pnJid) => socket?.signalRepository?.lidMapping?.getLIDForPN(pnJid) ?? Promise.resolve(null)
  );

  const membershipPort = new BaileysGroupMembershipAdapter(fetchGroupMetadata, () => socket?.user);

  async function connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(deps.authDir);

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, waLogger),
      },
      logger: waLogger,
      browser: Browsers.ubuntu('Chrome'),
      // The bot only ever reads live traffic, and a history sync is the one
      // thing that would spike memory on a box sized for a WebSocket.
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      // Staying invisible keeps push notifications flowing to the real phone.
      markOnlineOnConnect: false,
      emitOwnEvents: false,
      generateHighQualityLinkPreview: false,
      // No message store, so a peer's retry request cannot be served. Text in a
      // small family group makes that a rare and cheap loss.
      getMessage: async () => undefined,
    });

    socket = sock;
    armStallWatchdog();

    sock.ev.on('creds.update', () => {
      void saveCreds().catch((err) => error({ err }, 'failed to persist wa credentials'));
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') {
        return;
      }

      for (const message of messages) {
        // Every handler here has to swallow its own errors: the process guards
        // turn an unhandled rejection into an exit.
        void (async () => {
          try {
            const incoming = toIncomingMessage(message, {
              pnJid: sock.user?.id,
              lidJid: sock.user?.lid,
            });
            if (incoming) {
              await deps.onMessage(incoming);
            }
          } catch (err) {
            error({ err }, 'failed to handle incoming message');
          }
        })();
      }
    });

    sock.ev.on('connection.update', (update) => {
      try {
        handleConnectionUpdate(update);
      } catch (err) {
        error({ err }, 'failed to handle connection update');
      }
    });
  }

  function handleConnectionUpdate(update: {
    connection?: string;
    lastDisconnect?: { error?: Error } | undefined;
    qr?: string;
  }): void {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      renderQr(qr);
    }

    if (connection === 'open') {
      connected = true;
      consecutiveFailures = 0;
      consecutiveRestartRequired = 0;
      clearTimeout(stallTimer);
      log({ botId: socket?.user?.id }, 'whatsapp socket open');
      deps.onReady();
      return;
    }

    if (connection !== 'close') {
      return;
    }

    connected = false;
    if (stopping) {
      return;
    }

    const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
      ?.output?.statusCode;
    const decision = decideReconnect({
      statusCode,
      consecutiveFailures,
      consecutiveRestartRequired,
    });

    if (decision.action === 'exit') {
      if (decision.wipeAuth) {
        wipeAuthDir(deps.authDir);
      }
      handleDisconnect(decision.reason);
      return;
    }

    if (statusCode === DisconnectReason.restartRequired) {
      consecutiveRestartRequired += 1;
    } else {
      consecutiveFailures += 1;
    }

    log(
      { statusCode, delayMs: decision.delayMs, reason: decision.reason, consecutiveFailures },
      'whatsapp socket closed, reconnecting'
    );
    armStallWatchdog();

    setTimeout(() => {
      if (stopping) {
        return;
      }
      void connect().catch((err) => {
        error({ err }, 'reconnect attempt failed to start');
      });
    }, decision.delayMs).unref();
  }

  return {
    senderPort,
    membershipPort,
    isConnected: () => connected,
    start: connect,
    stop: () => {
      // Set before ending the socket: the resulting 'close' would otherwise
      // kick the ladder and race the shutdown.
      stopping = true;
      connected = false;
      clearTimeout(stallTimer);
      try {
        socket?.end(undefined);
      } catch (err) {
        debug({ err }, 'error ending whatsapp socket');
      }
    },
  };
}

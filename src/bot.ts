import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { debug, log, error } from './logger.js';

// Clear ALL Chromium lock files recursively from the data directory
function clearLockFiles(dir: string): void {
  if (!fs.existsSync(dir)) return;

  const lockFileNames = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile'];

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        clearLockFiles(fullPath);
      } else if (lockFileNames.includes(item.name)) {
        try {
          fs.unlinkSync(fullPath);
          debug({ path: fullPath }, 'cleared lock file');
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Ignore read errors
  }
}

export function createWhatsAppClient(): InstanceType<typeof Client> {
  const dataPath = process.env.RAILWAY_VOLUME_MOUNT_PATH || '.wwebjs_auth';

  debug({ dataPath }, 'clearing stale chromium locks');
  clearLockFiles(dataPath);

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--mute-audio',
        '--no-first-run',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--js-flags=--max-old-space-size=384',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    },
  });

  client.on('loading_screen', (percent, message) => {
    debug({ percent, message }, 'loading screen');
  });

  client.on('change_state', (state) => {
    debug({ state }, 'state changed');
  });

  client.on('qr', (qr) => {
    log('\n📱 Scan this QR code with WhatsApp:\n');
    qrcode.generate(qr, { small: true });

    // Also provide a URL-based QR code that renders better in web logs
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    log('\n🔗 Or open this URL to scan the QR code:');
    log(qrUrl);
    log('\n');
  });

  client.on('authenticated', () => {
    debug('client authenticated');
  });

  client.on('message', () => {
    debug('incoming message event received');
  });

  client.on('auth_failure', (msg) => {
    error({ reason: msg }, 'authentication failure');
  });

  client.on('disconnected', (reason) => {
    log({ reason }, 'client disconnected');
  });

  return client;
}

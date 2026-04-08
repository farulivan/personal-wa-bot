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
          debug(`🔓 Cleared lock: ${fullPath}`);
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

  debug('🧹 Clearing stale Chromium locks...');
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
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    },
  });

  client.on('loading_screen', (percent, message) => {
    debug('⏳ Loading:', percent + '%', message);
  });

  client.on('change_state', (state) => {
    debug('🔄 State changed:', state);
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
    debug('🔐 Client authenticated');
  });

  client.on('message', () => {
    debug('📩 Incoming message event received');
  });

  client.on('auth_failure', (msg) => {
    error('❌ Authentication failure:', msg);
  });

  client.on('disconnected', (reason) => {
    log('🔌 Client disconnected:', reason);
  });

  return client;
}

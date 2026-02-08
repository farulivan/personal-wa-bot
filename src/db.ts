import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || 'data';
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'bot.db'));

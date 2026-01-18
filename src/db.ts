import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || 'data';
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'bot.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    reps INTEGER NOT NULL,
    sets INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )
`);

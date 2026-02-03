import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { appConfig } from '../config/app.config.js';

fs.mkdirSync(appConfig.dataPath, { recursive: true });

export const db = new Database(path.join(appConfig.dataPath, 'bot.db'));

// Initialize database schema
export function initDatabase(): void {
  // Workouts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT NOT NULL,
      type TEXT NOT NULL,
      reps INTEGER NOT NULL,
      sets INTEGER NOT NULL,
      weight INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  // Future tables can be added here
  // Notes table (for future use)
  // db.exec(`
  //   CREATE TABLE IF NOT EXISTS notes (
  //     id INTEGER PRIMARY KEY AUTOINCREMENT,
  //     user TEXT NOT NULL,
  //     content TEXT NOT NULL,
  //     created_at TEXT NOT NULL
  //   )
  // `);
}

// Initialize on import
initDatabase();

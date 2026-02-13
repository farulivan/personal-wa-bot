import type { Database } from 'better-sqlite3';
import { debug } from '../logger.js';

export function upsertUserProfile(db: Database, sender: string, displayName: string): void {
  if (!displayName || displayName === 'undefined') return;

  db.prepare(
    `INSERT INTO user_profiles (sender, display_name, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(sender) DO UPDATE SET
       display_name = excluded.display_name,
       updated_at = excluded.updated_at`
  ).run(sender, displayName);

  debug(`👤 Profile cached: ${sender} → "${displayName}"`);
}

export function getDisplayName(db: Database, sender: string): string | null {
  const row = db.prepare(`SELECT display_name FROM user_profiles WHERE sender = ?`).get(sender) as
    | { display_name: string }
    | undefined;
  return row?.display_name ?? null;
}

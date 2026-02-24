import type { Database } from 'better-sqlite3';
import type { UserRepository, UserRow, UpsertUserData } from './userRepository.js';

type DbUserRow = {
  id: string;
  phone_number: string | null;
  contact_name: string | null;
  pushname: string | null;
  created_at: string;
  updated_at: string;
};

function toUserRow(row: DbUserRow): UserRow {
  return {
    id: row.id,
    phoneNumber: row.phone_number,
    contactName: row.contact_name,
    pushname: row.pushname,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDisplayName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export class SqliteUserRepository implements UserRepository {
  constructor(private db: Database) {}

  upsert(data: UpsertUserData): void {
    const now = new Date().toISOString();
    const existing = this.findById(data.id);

    if (existing) {
      const updates: string[] = [];
      const params: unknown[] = [];

      if (data.phoneNumber !== undefined && data.phoneNumber !== existing.phoneNumber) {
        updates.push('phone_number = ?');
        params.push(data.phoneNumber);
      }
      if (data.contactName !== undefined && data.contactName !== existing.contactName) {
        updates.push('contact_name = ?');
        params.push(data.contactName);
      }
      if (data.pushname !== undefined && data.pushname !== existing.pushname) {
        updates.push('pushname = ?');
        params.push(data.pushname);
      }

      if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(now, data.id);

        this.db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }
    } else {
      this.db
        .prepare(
          `INSERT INTO users (id, phone_number, contact_name, pushname, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          data.id,
          data.phoneNumber ?? null,
          data.contactName ?? null,
          data.pushname ?? null,
          now,
          now
        );
    }
  }

  findById(id: string): UserRow | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
      | DbUserRow
      | undefined;

    return row ? toUserRow(row) : null;
  }

  findByIds(ids: string[]): UserRow[] {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM users WHERE id IN (${placeholders})`)
      .all(...ids) as DbUserRow[];

    return rows.map(toUserRow);
  }

  getDisplayName(id: string): string {
    const user = this.findById(id);
    if (!user) return id.replace(/@.*$/, '');

    if (user.pushname) return toDisplayName(user.pushname);
    if (user.contactName) return toDisplayName(user.contactName);
    if (user.phoneNumber) return user.phoneNumber;

    return id.replace(/@.*$/, '');
  }
}

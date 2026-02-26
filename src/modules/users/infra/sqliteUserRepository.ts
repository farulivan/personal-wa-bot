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

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export class SqliteUserRepository implements UserRepository {
  constructor(private db: Database) {}

  private findBestByPhoneNumber(phoneNumber: string): UserRow | null {
    const row = this.db
      .prepare(
        `SELECT *
         FROM users
         WHERE phone_number = ?
         ORDER BY
           CASE
             WHEN pushname IS NOT NULL AND TRIM(pushname) <> '' THEN 0
             WHEN contact_name IS NOT NULL AND TRIM(contact_name) <> '' THEN 1
             ELSE 2
           END,
           updated_at DESC
         LIMIT 1`
      )
      .get(phoneNumber) as DbUserRow | undefined;

    return row ? toUserRow(row) : null;
  }

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
    const normalizedId = id.replace(/@.*$/, '');
    const exactUser = this.findById(id);
    const normalizedUser = normalizedId !== id ? this.findById(normalizedId) : null;
    const byPhone = this.findBestByPhoneNumber(normalizedId);
    const user = exactUser ?? normalizedUser ?? byPhone;

    if (!user) return normalizedId;

    if (hasText(user.pushname)) return toDisplayName(user.pushname);
    if (hasText(user.contactName)) return toDisplayName(user.contactName);

    if (byPhone) {
      if (hasText(byPhone.pushname)) return toDisplayName(byPhone.pushname);
      if (hasText(byPhone.contactName)) return toDisplayName(byPhone.contactName);
    }

    if (hasText(user.phoneNumber)) return user.phoneNumber;

    return normalizedId;
  }
}

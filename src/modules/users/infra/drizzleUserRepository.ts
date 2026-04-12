import { eq, sql, inArray } from 'drizzle-orm';
import type { DrizzleDb } from '../../../db/drizzle.js';
import { users } from './schema.js';
import type { UserRepository, UserRow, UpsertUserData } from './userRepository.js';

function toUserRow(row: {
  id: string;
  phoneNumber: string | null;
  contactName: string | null;
  pushname: string | null;
  createdAt: string;
  updatedAt: string;
}): UserRow {
  return {
    id: row.id,
    phoneNumber: row.phoneNumber,
    contactName: row.contactName,
    pushname: row.pushname,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: DrizzleDb) {}

  private async findBestByPhoneNumber(phoneNumber: string): Promise<UserRow | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, phoneNumber))
      .orderBy(
        sql`CASE
          WHEN ${users.pushname} IS NOT NULL AND TRIM(${users.pushname}) <> '' THEN 0
          WHEN ${users.contactName} IS NOT NULL AND TRIM(${users.contactName}) <> '' THEN 1
          ELSE 2
        END`,
        sql`${users.updatedAt} DESC`
      )
      .limit(1);

    return rows[0] ? toUserRow(rows[0]) : null;
  }

  async upsert(data: UpsertUserData): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.findById(data.id);

    if (existing) {
      const updates: Record<string, unknown> = {};

      if (data.phoneNumber !== undefined && data.phoneNumber !== existing.phoneNumber) {
        updates.phoneNumber = data.phoneNumber;
      }
      if (data.contactName !== undefined && data.contactName !== existing.contactName) {
        updates.contactName = data.contactName;
      }
      if (data.pushname !== undefined && data.pushname !== existing.pushname) {
        updates.pushname = data.pushname;
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = now;
        await this.db.update(users).set(updates).where(eq(users.id, data.id));
      }
    } else {
      await this.db.insert(users).values({
        id: data.id,
        phoneNumber: data.phoneNumber ?? null,
        contactName: data.contactName ?? null,
        pushname: data.pushname ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async findById(id: string): Promise<UserRow | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);

    return rows[0] ? toUserRow(rows[0]) : null;
  }

  async findByIds(ids: string[]): Promise<UserRow[]> {
    if (ids.length === 0) return [];

    const rows = await this.db.select().from(users).where(inArray(users.id, ids));

    return rows.map(toUserRow);
  }

  async getDisplayName(id: string): Promise<string> {
    const normalizedId = id.replace(/@.*$/, '');
    const exactUser = await this.findById(id);
    const normalizedUser = normalizedId !== id ? await this.findById(normalizedId) : null;
    const byPhone = await this.findBestByPhoneNumber(normalizedId);
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

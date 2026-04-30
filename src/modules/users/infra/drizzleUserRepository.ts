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

function selectDisplayName(
  normalizedId: string,
  exactUser: UserRow | null,
  normalizedUser: UserRow | null,
  byPhone: UserRow | null
): string {
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
    if (exactUser && hasText(exactUser.pushname)) {
      return toDisplayName(exactUser.pushname);
    }
    const normalizedUser = normalizedId !== id ? await this.findById(normalizedId) : null;
    const byPhone = await this.findBestByPhoneNumber(normalizedId);
    return selectDisplayName(normalizedId, exactUser, normalizedUser, byPhone);
  }

  private async findBestByPhoneNumbers(phoneNumbers: string[]): Promise<Map<string, UserRow>> {
    if (phoneNumbers.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([users.phoneNumber])
      .from(users)
      .where(inArray(users.phoneNumber, phoneNumbers))
      .orderBy(
        users.phoneNumber,
        sql`CASE
          WHEN ${users.pushname} IS NOT NULL AND TRIM(${users.pushname}) <> '' THEN 0
          WHEN ${users.contactName} IS NOT NULL AND TRIM(${users.contactName}) <> '' THEN 1
          ELSE 2
        END`,
        sql`${users.updatedAt} DESC`
      );
    const out = new Map<string, UserRow>();
    for (const row of rows) {
      if (row.phoneNumber !== null) {
        out.set(row.phoneNumber, toUserRow(row));
      }
    }
    return out;
  }

  async getDisplayNamesByIds(ids: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (ids.length === 0) return result;

    const uniqueIds = [...new Set(ids)];
    const normalizedById = new Map(uniqueIds.map((id) => [id, id.replace(/@.*$/, '')]));

    const idsToFetch = new Set<string>();
    for (const id of uniqueIds) {
      idsToFetch.add(id);
      const normalized = normalizedById.get(id)!;
      if (normalized !== id) idsToFetch.add(normalized);
    }
    const userRows = await this.findByIds([...idsToFetch]);
    const userById = new Map(userRows.map((u) => [u.id, u]));

    const phoneNumbersToLookup = new Set<string>();
    for (const id of uniqueIds) {
      const normalized = normalizedById.get(id)!;
      const exactUser = userById.get(id) ?? null;
      const normalizedUser = normalized !== id ? (userById.get(normalized) ?? null) : null;
      const candidate = exactUser ?? normalizedUser;
      if (!candidate || !hasText(candidate.pushname)) {
        phoneNumbersToLookup.add(normalized);
      }
    }
    const byPhoneMap = await this.findBestByPhoneNumbers([...phoneNumbersToLookup]);

    for (const id of uniqueIds) {
      const normalized = normalizedById.get(id)!;
      const exactUser = userById.get(id) ?? null;
      const normalizedUser = normalized !== id ? (userById.get(normalized) ?? null) : null;
      const byPhone = byPhoneMap.get(normalized) ?? null;
      result.set(id, selectDisplayName(normalized, exactUser, normalizedUser, byPhone));
    }
    return result;
  }
}

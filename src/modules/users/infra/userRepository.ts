export type UserRow = {
  id: string;
  phoneNumber: string | null;
  contactName: string | null;
  pushname: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertUserData = {
  id: string;
  phoneNumber?: string;
  contactName?: string;
  pushname?: string;
};

export interface UserRepository {
  upsert(data: UpsertUserData): void;
  findById(id: string): UserRow | null;
  findByIds(ids: string[]): UserRow[];
  getDisplayName(id: string): string;
}

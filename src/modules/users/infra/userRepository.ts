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
  upsert(data: UpsertUserData): Promise<void>;
  findById(id: string): Promise<UserRow | null>;
  findByIds(ids: string[]): Promise<UserRow[]>;
  getDisplayName(id: string): Promise<string>;
  getDisplayNamesByIds(ids: string[]): Promise<Map<string, string>>;
  getPhoneNumbersByIds(ids: string[]): Promise<Map<string, string | null>>;
}

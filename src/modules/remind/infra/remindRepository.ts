export type ReminderSourceType = 'group' | 'direct';

export type NewReminder = {
  userId: string;
  targetChatId: string;
  sourceType: ReminderSourceType;
  reminderText: string;
  scheduledAt: string;
  createdAt: string;
};

export type ReminderListRow = {
  id: number;
  userId: string;
  targetChatId: string;
  sourceType: ReminderSourceType;
  reminderText: string;
  scheduledAt: string;
  createdAt: string;
  sentAt: string | null;
};

export type DueReminderRow = ReminderListRow;

export interface RemindRepository {
  insertReminder(input: NewReminder): Promise<void>;
  countByUser(userId: string): Promise<number>;
  countActiveByUser(userId: string): Promise<number>;
  listByUser(userId: string, limit: number, offset: number): Promise<ReminderListRow[]>;
  listDuePending(nowIso: string, limit: number): Promise<DueReminderRow[]>;
  markAsSent(id: number, sentAt: string): Promise<void>;
  findLastActiveByUser(userId: string): Promise<ReminderListRow | null>;
  softDeleteById(id: number, deletedAtIso: string): Promise<void>;
}

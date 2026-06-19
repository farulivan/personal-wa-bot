export type SholatLocationRow = {
  id: string;
  locationName: string;
  normalizedLocationName: string;
};

export type NewSholatLocation = {
  id: string;
  locationName: string;
  normalizedLocationName: string;
  fetchedAtUtc: string;
};

export type SholatDailyScheduleRow = {
  locationId: string;
  scheduleDate: string;
  timezone: string;
  displayDate: string;
  imsak: string;
  subuh: string;
  terbit: string;
  dhuha: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
};

export type NewSholatDailySchedule = {
  locationId: string;
  scheduleDate: string;
  timezone: string;
  displayDate: string;
  imsak: string;
  subuh: string;
  terbit: string;
  dhuha: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
  fetchedAtUtc: string;
};

export type SholatReminderSettingRow = {
  chatId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export interface SholatRepository {
  countLocations(): Promise<number>;
  upsertLocations(rows: NewSholatLocation[]): Promise<void>;
  listLocations(): Promise<SholatLocationRow[]>;
  findDailySchedule(
    locationId: string,
    scheduleDate: string,
    timezone: string
  ): Promise<SholatDailyScheduleRow | null>;
  upsertDailySchedule(row: NewSholatDailySchedule): Promise<void>;
  setReminderEnabled(chatId: string, enabled: boolean, nowIso: string): Promise<void>;
  isReminderEnabled(chatId: string): Promise<boolean>;
  listEnabledReminderChats(): Promise<string[]>;
}

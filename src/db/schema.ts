import { pgTable, serial, text, integer, real, index, primaryKey } from 'drizzle-orm/pg-core';

// --- workouts ---
export const workouts = pgTable('workouts', {
  id: serial('id').primaryKey(),
  user: text('user').notNull(),
  type: text('type').notNull(),
  reps: integer('reps').notNull(),
  sets: integer('sets').notNull(),
  weight: integer('weight').notNull().default(0),
  workoutMode: text('workout_mode').notNull().default('lift'),
  durationMinutes: real('duration_minutes').notNull().default(0),
  distanceKm: real('distance_km').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

// --- quran_daily_reads ---
export const quranDailyReads = pgTable(
  'quran_daily_reads',
  {
    id: serial('id').primaryKey(),
    user: text('user').notNull(),
    pages: integer('pages').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_quran_daily_reads_user_created_at').on(table.user, table.createdAt),
    index('idx_quran_daily_reads_created_at').on(table.createdAt),
  ]
);

// --- quran_marks ---
export const quranMarks = pgTable('quran_marks', {
  user: text('user').primaryKey(),
  page: integer('page').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// --- sholat_locations ---
export const sholatLocations = pgTable(
  'sholat_locations',
  {
    id: text('id').primaryKey(),
    locationName: text('location_name').notNull(),
    normalizedLocationName: text('normalized_location_name').notNull(),
    fetchedAtUtc: text('fetched_at_utc').notNull(),
  },
  (table) => [index('idx_sholat_locations_normalized').on(table.normalizedLocationName)]
);

// --- sholat_daily_cache ---
export const sholatDailyCache = pgTable(
  'sholat_daily_cache',
  {
    locationId: text('location_id')
      .notNull()
      .references(() => sholatLocations.id, { onUpdate: 'cascade', onDelete: 'cascade' }),
    scheduleDate: text('schedule_date').notNull(),
    timezone: text('timezone').notNull(),
    displayDate: text('display_date').notNull(),
    imsak: text('imsak').notNull(),
    subuh: text('subuh').notNull(),
    terbit: text('terbit').notNull(),
    dhuha: text('dhuha').notNull(),
    dzuhur: text('dzuhur').notNull(),
    ashar: text('ashar').notNull(),
    maghrib: text('maghrib').notNull(),
    isya: text('isya').notNull(),
    fetchedAtUtc: text('fetched_at_utc').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.locationId, table.scheduleDate, table.timezone] }),
    index('idx_sholat_daily_cache_date_tz').on(table.scheduleDate, table.timezone),
  ]
);

// --- reminders ---
export const reminders = pgTable(
  'reminders',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    targetChatId: text('target_chat_id').notNull(),
    sourceType: text('source_type').notNull(),
    reminderText: text('reminder_text').notNull(),
    scheduledAt: text('scheduled_at').notNull(),
    createdAt: text('created_at').notNull(),
    sentAt: text('sent_at'),
  },
  (table) => [
    index('idx_reminders_user_created').on(table.userId, table.createdAt),
    index('idx_reminders_pending_schedule').on(table.sentAt, table.scheduledAt),
  ]
);

// --- users ---
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    phoneNumber: text('phone_number'),
    contactName: text('contact_name'),
    pushname: text('pushname'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_users_phone_number').on(table.phoneNumber)]
);

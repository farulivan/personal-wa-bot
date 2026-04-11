import { pgTable, text, index, primaryKey } from 'drizzle-orm/pg-core';

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

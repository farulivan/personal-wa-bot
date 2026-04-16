import { pgTable, serial, text, integer, real, index } from 'drizzle-orm/pg-core';

export const workoutLifts = pgTable(
  'workout_lifts',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    activity: text('activity').notNull(),
    reps: integer('reps').notNull(),
    sets: integer('sets').notNull(),
    weightKg: real('weight_kg').notNull().default(0),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [index('idx_workout_lifts_user_created').on(table.userId, table.createdAt)]
);

export const workoutCardios = pgTable(
  'workout_cardios',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    activity: text('activity').notNull(),
    durationMinutes: real('duration_minutes').notNull(),
    distanceKm: real('distance_km').notNull().default(0),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [index('idx_workout_cardios_user_created').on(table.userId, table.createdAt)]
);

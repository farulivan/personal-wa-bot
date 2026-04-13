import { pgTable, serial, text, integer, real } from 'drizzle-orm/pg-core';

export const workoutLifts = pgTable('workout_lifts', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  activity: text('activity').notNull(),
  reps: integer('reps').notNull(),
  sets: integer('sets').notNull(),
  weightKg: real('weight_kg').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const workoutCardios = pgTable('workout_cardios', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  activity: text('activity').notNull(),
  durationMinutes: real('duration_minutes').notNull(),
  distanceKm: real('distance_km').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

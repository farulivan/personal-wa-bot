import { pgTable, serial, text, integer, real } from 'drizzle-orm/pg-core';

export const workouts = pgTable('workouts', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  reps: integer('reps').notNull(),
  sets: integer('sets').notNull(),
  weight: real('weight').notNull().default(0),
  workoutMode: text('workout_mode').notNull().default('lift'),
  durationMinutes: real('duration_minutes').notNull().default(0),
  distanceKm: real('distance_km').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

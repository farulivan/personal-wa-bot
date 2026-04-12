-- Create new lift table
CREATE TABLE "workout_lifts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "activity" text NOT NULL,
  "reps" integer NOT NULL,
  "sets" integer NOT NULL,
  "weight_kg" real DEFAULT 0 NOT NULL,
  "created_at" text NOT NULL
);
--> statement-breakpoint
-- Create new cardio table
CREATE TABLE "workout_cardios" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "activity" text NOT NULL,
  "duration_minutes" real NOT NULL,
  "distance_km" real DEFAULT 0 NOT NULL,
  "created_at" text NOT NULL
);
--> statement-breakpoint
-- Backfill lift data
INSERT INTO "workout_lifts" ("user_id", "activity", "reps", "sets", "weight_kg", "created_at")
SELECT "user_id", "type", "reps", "sets", "weight", "created_at"
FROM "workouts"
WHERE "workout_mode" = 'lift';
--> statement-breakpoint
-- Backfill cardio data
INSERT INTO "workout_cardios" ("user_id", "activity", "duration_minutes", "distance_km", "created_at")
SELECT "user_id", "type", "duration_minutes", "distance_km", "created_at"
FROM "workouts"
WHERE "workout_mode" = 'cardio';
--> statement-breakpoint
-- Rename old table as backup (drop manually after verifying production)
ALTER TABLE "workouts" RENAME TO "workouts_deprecated";

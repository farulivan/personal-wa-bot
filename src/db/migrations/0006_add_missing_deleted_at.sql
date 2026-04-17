-- Idempotent fix: add deleted_at columns if they were never applied
ALTER TABLE "workout_lifts" ADD COLUMN IF NOT EXISTS "deleted_at" text;
--> statement-breakpoint
ALTER TABLE "workout_cardios" ADD COLUMN IF NOT EXISTS "deleted_at" text;

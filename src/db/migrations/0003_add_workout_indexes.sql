CREATE INDEX IF NOT EXISTS "idx_workout_lifts_user_created" ON "workout_lifts" ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workout_cardios_user_created" ON "workout_cardios" ("user_id","created_at");

CREATE TABLE "quran_daily_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user" text NOT NULL,
	"pages" integer NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quran_marks" (
	"user" text PRIMARY KEY NOT NULL,
	"page" integer NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target_chat_id" text NOT NULL,
	"source_type" text NOT NULL,
	"reminder_text" text NOT NULL,
	"scheduled_at" text NOT NULL,
	"created_at" text NOT NULL,
	"sent_at" text
);
--> statement-breakpoint
CREATE TABLE "sholat_daily_cache" (
	"location_id" text NOT NULL,
	"schedule_date" text NOT NULL,
	"timezone" text NOT NULL,
	"display_date" text NOT NULL,
	"imsak" text NOT NULL,
	"subuh" text NOT NULL,
	"terbit" text NOT NULL,
	"dhuha" text NOT NULL,
	"dzuhur" text NOT NULL,
	"ashar" text NOT NULL,
	"maghrib" text NOT NULL,
	"isya" text NOT NULL,
	"fetched_at_utc" text NOT NULL,
	CONSTRAINT "sholat_daily_cache_location_id_schedule_date_timezone_pk" PRIMARY KEY("location_id","schedule_date","timezone")
);
--> statement-breakpoint
CREATE TABLE "sholat_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"location_name" text NOT NULL,
	"normalized_location_name" text NOT NULL,
	"fetched_at_utc" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"phone_number" text,
	"contact_name" text,
	"pushname" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user" text NOT NULL,
	"type" text NOT NULL,
	"reps" integer NOT NULL,
	"sets" integer NOT NULL,
	"weight" real DEFAULT 0 NOT NULL,
	"workout_mode" text DEFAULT 'lift' NOT NULL,
	"duration_minutes" real DEFAULT 0 NOT NULL,
	"distance_km" real DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sholat_daily_cache" ADD CONSTRAINT "sholat_daily_cache_location_id_sholat_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."sholat_locations"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "idx_quran_daily_reads_user_created_at" ON "quran_daily_reads" USING btree ("user","created_at");--> statement-breakpoint
CREATE INDEX "idx_quran_daily_reads_created_at" ON "quran_daily_reads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_reminders_user_created" ON "reminders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_reminders_pending_schedule" ON "reminders" USING btree ("sent_at","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_sholat_daily_cache_date_tz" ON "sholat_daily_cache" USING btree ("schedule_date","timezone");--> statement-breakpoint
CREATE INDEX "idx_sholat_locations_normalized" ON "sholat_locations" USING btree ("normalized_location_name");--> statement-breakpoint
CREATE INDEX "idx_users_phone_number" ON "users" USING btree ("phone_number");
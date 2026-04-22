-- Sync drizzle.__drizzle_migrations to match the journal's chronological `when` values.
-- Safe to re-run (idempotent: UPDATE existing rows, INSERT only missing ones).
--
-- CONTEXT
-- Drizzle's migrator applies any journal entry whose `when` is strictly greater than
-- MAX(created_at) in drizzle.__drizzle_migrations. Historically this project stored
-- future-stamped `when` values (Aug 2026 range) for entries 0001-0004 and 0007-0009,
-- which made `drizzle-kit generate`'s real-time stamps (Apr 2026 and earlier) appear
-- "older" than the high-water mark, causing new migrations to be silently skipped
-- on production. This script realigns every already-applied migration to the new
-- real-time chronological `when` values from _journal.json.
--
-- WHAT THIS SCRIPT DOES
-- 1. Ensures the drizzle schema and __drizzle_migrations table exist.
-- 2. For each pre-applied migration (0000-0009):
--      * UPDATE created_at to the new `when` value, keyed by hash.
--      * INSERT the row if it's missing (fresh deploys where schema was pre-applied).
-- 3. 0010 is intentionally excluded so drizzle's migrate() applies it normally
--    (the ALTER TABLE reminders ADD COLUMN deleted_at has not run yet).
--
-- USAGE
--   psql "$DATABASE_URL" -f scripts/baseline-migrations.sql
--
-- WHEN TO RUN
--   * Once, after deploying code with the new journal timestamps.
--     Preferred order: run this script FIRST, then deploy the code so that drizzle's
--     migrate() reads the corrected created_at values when it decides whether to
--     apply 0010.
--   * Also safe to run on a fresh database where the 0000-0009 schema was applied
--     out-of-band (e.g., restored from dump); the INSERTs will populate the table.
--
-- HASHES
--   Each hash is the sha256 hex digest of the migration's .sql file contents,
--   matching the algorithm drizzle-orm uses in readMigrationFiles().

-- 1. Ensure the schema and table exist
CREATE SCHEMA IF NOT EXISTS "drizzle";

CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

-- 2. Update existing rows to the new `when` values
UPDATE "drizzle"."__drizzle_migrations" SET created_at = 1775297272830 WHERE hash = 'cb0752ab4fb7b13f343a97f479a5644f33a008212385803ffeec55995fe8087e';
UPDATE "drizzle"."__drizzle_migrations" SET created_at = 1775400000000 WHERE hash = '6055d043edf535d598f6d85451a09f9275d0e3dc2576a04d2633f5402a5b84d7';
UPDATE "drizzle"."__drizzle_migrations" SET created_at = 1775500000000 WHERE hash = '177e730d85ff992578ba2a4b12e14940438aa6b88fbe631ddc66d946a30962ad';
UPDATE "drizzle"."__drizzle_migrations" SET created_at = 1775600000000 WHERE hash = '3e49a9b498dbba6c7fd947145f9f18d6e08f451b3e217e0e00560b1248a8f77f';
UPDATE "drizzle"."__drizzle_migrations" SET created_at = 1775700000000 WHERE hash = '1592dd0332938ce7a3c057e0eda297843ff788b42f8c2b9ef6757b072f4a4556';
UPDATE "drizzle"."__drizzle_migrations" SET created_at = 1776325337803 WHERE hash = '20726cfdf336537fed73ffa4a325399c5cbbe9bf16ece7b9639f5a5d598590fb';
UPDATE "drizzle"."__drizzle_migrations" SET created_at = 1776498660000 WHERE hash = '291ecd4428abb0be46d3aba29207f2511701a17c3ef2b602e8e535fb047ffb45';
UPDATE "drizzle"."__drizzle_migrations" SET created_at = 1776510000000 WHERE hash = '1a4c5ea7ff47d05e8c7cdcb8ee9c29d7bb20c6ab9910882f94eed84a5d8fe67c';
UPDATE "drizzle"."__drizzle_migrations" SET created_at = 1776530000000 WHERE hash = '87e19200c44434fa8c087cafaaf9fe3d1ab06d60bc6666fdde449e910f328152';
UPDATE "drizzle"."__drizzle_migrations" SET created_at = 1776550000000 WHERE hash = 'e005ad9f6c380a4e34f103bf634be9d3d60b3af0ae0edad359b985c8043ce373';

-- 3. Insert any rows that are missing (fresh deploy with pre-applied schema)
INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
SELECT h, w
FROM (VALUES
  ('cb0752ab4fb7b13f343a97f479a5644f33a008212385803ffeec55995fe8087e'::text, 1775297272830::bigint),
  ('6055d043edf535d598f6d85451a09f9275d0e3dc2576a04d2633f5402a5b84d7',        1775400000000),
  ('177e730d85ff992578ba2a4b12e14940438aa6b88fbe631ddc66d946a30962ad',        1775500000000),
  ('3e49a9b498dbba6c7fd947145f9f18d6e08f451b3e217e0e00560b1248a8f77f',        1775600000000),
  ('1592dd0332938ce7a3c057e0eda297843ff788b42f8c2b9ef6757b072f4a4556',        1775700000000),
  ('20726cfdf336537fed73ffa4a325399c5cbbe9bf16ece7b9639f5a5d598590fb',        1776325337803),
  ('291ecd4428abb0be46d3aba29207f2511701a17c3ef2b602e8e535fb047ffb45',        1776498660000),
  ('1a4c5ea7ff47d05e8c7cdcb8ee9c29d7bb20c6ab9910882f94eed84a5d8fe67c',        1776510000000),
  ('87e19200c44434fa8c087cafaaf9fe3d1ab06d60bc6666fdde449e910f328152',        1776530000000),
  ('e005ad9f6c380a4e34f103bf634be9d3d60b3af0ae0edad359b985c8043ce373',        1776550000000)
) AS new_rows(h, w)
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" m WHERE m.hash = new_rows.h
);

-- 4. Verification: dump the synced state for a manual eyeball
SELECT hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at;

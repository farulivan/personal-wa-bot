-- One-time baseline script: sync drizzle.__drizzle_migrations with already-applied schema.
-- Run this ONCE against your Railway Postgres before deploying with migrate().
-- Safe to re-run (ON CONFLICT DO NOTHING on hash).
--
-- Drizzle's migrator applies any migration whose journal `when` is greater than
-- the MAX(created_at) in this table. The highest `when` across existing migrations
-- is 1781309100000 (0004). Future generated migrations will have a higher `when`.
--
-- Usage (Railway shell or psql):
--   psql "$DATABASE_URL" -f scripts/baseline-migrations.sql

-- 1. Create the schema and table exactly as drizzle-orm expects
CREATE SCHEMA IF NOT EXISTS "drizzle";

CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

-- 2. Insert a row for each existing migration (hash = sha256 of SQL file content)
--    Using a unique index on hash to make this idempotent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "drizzle"."__drizzle_migrations"
    WHERE hash = 'cb0752ab4fb7b13f343a97f479a5644f33a008212385803ffeec55995fe8087e'
  ) THEN
    INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES
      ('cb0752ab4fb7b13f343a97f479a5644f33a008212385803ffeec55995fe8087e', 1775297272830),
      ('6055d043edf535d598f6d85451a09f9275d0e3dc2576a04d2633f5402a5b84d7', 1781308800000),
      ('177e730d85ff992578ba2a4b12e14940438aa6b88fbe631ddc66d946a30962ad', 1781308900000),
      ('3e49a9b498dbba6c7fd947145f9f18d6e08f451b3e217e0e00560b1248a8f77f', 1781309000000),
      ('1592dd0332938ce7a3c057e0eda297843ff788b42f8c2b9ef6757b072f4a4556', 1781309100000),
      ('20726cfdf336537fed73ffa4a325399c5cbbe9bf16ece7b9639f5a5d598590fb', 1776325337803),
      ('291ecd4428abb0be46d3aba29207f2511701a17c3ef2b602e8e535fb047ffb45', 1776498660000);
  END IF;
END $$;

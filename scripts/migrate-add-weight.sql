-- Migration: Remove date column and add weight column
-- This recreates the table with the new schema
-- Run this on Railway if you have existing data

BEGIN TRANSACTION;

-- Create new table with updated schema (no date column)
CREATE TABLE workouts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  type TEXT NOT NULL,
  reps INTEGER NOT NULL,
  sets INTEGER NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Copy existing data (date column will be dropped)
INSERT INTO workouts_new (id, user, type, reps, sets, weight, created_at)
SELECT id, user, type, reps, sets, 0, created_at FROM workouts;

-- Drop old table
DROP TABLE workouts;

-- Rename new table
ALTER TABLE workouts_new RENAME TO workouts;

COMMIT;

-- Verify migration
SELECT COUNT(*) as total_workouts FROM workouts;
SELECT * FROM workouts LIMIT 5;

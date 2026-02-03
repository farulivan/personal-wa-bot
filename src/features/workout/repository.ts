import { db } from '../../core/database.js';
import { featuresConfig } from '../../config/features.config.js';

export interface Workout {
  id?: number;
  user: string;
  type: string;
  reps: number;
  sets: number;
  weight: number;
  created_at: string;
}

export interface WorkoutRow {
  created_at: string;
  type: string;
  reps: number;
  sets: number;
  weight: number;
}

// Save a new workout
export function saveWorkout(workout: Omit<Workout, 'id'>): void {
  const stmt = db.prepare(
    `INSERT INTO workouts (user, type, reps, sets, weight, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    workout.user,
    workout.type,
    workout.reps,
    workout.sets,
    workout.weight,
    workout.created_at
  );
}

// Get recent workouts for a user
export function getRecentWorkouts(user: string): WorkoutRow[] {
  const limit = featuresConfig.workout.listLimit;
  const stmt = db.prepare(
    `SELECT created_at, type, reps, sets, weight FROM workouts 
     WHERE user = ? 
     ORDER BY created_at DESC 
     LIMIT ?`
  );
  return stmt.all(user, limit) as WorkoutRow[];
}

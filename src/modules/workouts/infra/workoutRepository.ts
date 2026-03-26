export type WorkoutRow = {
  created_at: string;
  workout_mode: 'lift' | 'cardio';
  type: string;
  reps: number;
  sets: number;
  weight: number;
  duration_minutes: number;
  distance_km: number;
};

export type NewLiftWorkoutLog = {
  user: string;
  workoutMode: 'lift';
  type: string;
  reps: number;
  sets: number;
  weight: number;
  durationMinutes: number;
  distanceKm: number;
  createdAtIso: string;
};

export type NewCardioWorkoutLog = {
  user: string;
  workoutMode: 'cardio';
  type: string;
  reps: number;
  sets: number;
  weight: number;
  durationMinutes: number;
  distanceKm: number;
  createdAtIso: string;
};

export type NewWorkoutLog = NewLiftWorkoutLog | NewCardioWorkoutLog;

export interface WorkoutRepository {
  countByUser(user: string): number;
  listByUser(user: string, limit: number, offset: number): WorkoutRow[];
  insertWorkoutLog(log: NewWorkoutLog): void;
  listDistinctUsers(): string[];
}

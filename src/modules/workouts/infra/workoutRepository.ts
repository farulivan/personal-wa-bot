export type LiftWorkoutEntry = {
  createdAt: string;
  workoutMode: 'lift';
  type: string;
  reps: number;
  sets: number;
  weight: number;
};

export type CardioWorkoutEntry = {
  createdAt: string;
  workoutMode: 'cardio';
  type: string;
  durationMinutes: number;
  distanceKm: number;
};

export type WorkoutEntry = LiftWorkoutEntry | CardioWorkoutEntry;

export type NewLiftWorkoutLog = {
  user: string;
  workoutMode: 'lift';
  type: string;
  reps: number;
  sets: number;
  weight: number;
  createdAtIso: string;
};

export type NewCardioWorkoutLog = {
  user: string;
  workoutMode: 'cardio';
  type: string;
  durationMinutes: number;
  distanceKm: number;
  createdAtIso: string;
};

export type NewWorkoutLog = NewLiftWorkoutLog | NewCardioWorkoutLog;

export interface WorkoutRepository {
  countByUser(user: string): Promise<number>;
  listByUser(user: string, limit: number, offset: number): Promise<WorkoutEntry[]>;
  insertWorkoutLog(log: NewWorkoutLog): Promise<void>;
  listDistinctUsers(): Promise<string[]>;
  getQualifyingStreakDays(user: string, timezoneOffsetMinutes: number): Promise<string[]>;
  getTodayCount(user: string, timezoneOffsetMinutes: number, nowIso: string): Promise<number>;
}

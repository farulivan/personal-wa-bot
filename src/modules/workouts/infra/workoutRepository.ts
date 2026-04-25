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

export type DeletedWorkoutEntry = WorkoutEntry & { id: number };

export type NewLiftWorkoutLog = {
  userId: string;
  workoutMode: 'lift';
  type: string;
  reps: number;
  sets: number;
  weight: number;
  createdAtIso: string;
};

export type NewCardioWorkoutLog = {
  userId: string;
  workoutMode: 'cardio';
  type: string;
  durationMinutes: number;
  distanceKm: number;
  createdAtIso: string;
};

export type NewWorkoutLog = NewLiftWorkoutLog | NewCardioWorkoutLog;

export interface WorkoutRepository {
  countByUser(user: string): Promise<number>;
  countSessionsByUserInDateRange(
    user: string,
    timezoneOffsetMinutes: number,
    startDateInclusive: string,
    endDateInclusive: string,
  ): Promise<number>;
  listByUser(user: string, limit: number, offset: number): Promise<WorkoutEntry[]>;
  insertWorkoutLog(log: NewWorkoutLog): Promise<void>;
  listDistinctUsers(): Promise<string[]>;
  getQualifyingStreakDays(user: string, timezoneOffsetMinutes: number): Promise<string[]>;
  getTodayCount(user: string, timezoneOffsetMinutes: number, nowIso: string): Promise<number>;
  findLastByUser(user: string): Promise<DeletedWorkoutEntry | null>;
  softDeleteById(id: number, workoutMode: 'lift' | 'cardio', deletedAtIso: string): Promise<void>;
}

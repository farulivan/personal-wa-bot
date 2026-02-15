export type WorkoutRow = {
  created_at: string;
  type: string;
  reps: number;
  sets: number;
  weight: number;
};

export type NewWorkoutLog = {
  user: string;
  type: string;
  reps: number;
  sets: number;
  weight: number;
  createdAtIso: string;
};

export interface WorkoutRepository {
  countByUser(user: string): number;
  listByUser(user: string, limit: number, offset: number): WorkoutRow[];
  insertWorkoutLog(log: NewWorkoutLog): void;
  listDistinctUsers(): string[];
}

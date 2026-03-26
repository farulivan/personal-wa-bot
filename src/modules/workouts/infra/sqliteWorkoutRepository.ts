import type { Database } from 'better-sqlite3';
import type { NewWorkoutLog, WorkoutRepository, WorkoutRow } from './workoutRepository.js';

export class SqliteWorkoutRepository implements WorkoutRepository {
  constructor(private readonly db: Database) {}

  countByUser(user: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS total FROM workouts WHERE user = ?`)
      .get(user) as { total: number };

    return row.total;
  }

  listByUser(user: string, limit: number, offset: number): WorkoutRow[] {
    return this.db
      .prepare(
        `SELECT created_at, workout_mode, type, reps, sets, weight, duration_minutes, distance_km FROM workouts 
     WHERE user = ? 
     ORDER BY created_at DESC 
     LIMIT ? OFFSET ?`
      )
      .all(user, limit, offset) as WorkoutRow[];
  }

  insertWorkoutLog(log: NewWorkoutLog): void {
    const stmt = this.db.prepare(
      `INSERT INTO workouts (user, workout_mode, type, reps, sets, weight, duration_minutes, distance_km, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    stmt.run(
      log.user,
      log.workoutMode,
      log.type,
      log.reps,
      log.sets,
      log.weight,
      log.durationMinutes,
      log.distanceKm,
      log.createdAtIso
    );
  }

  listDistinctUsers(): string[] {
    const rows = this.db.prepare(`SELECT DISTINCT user FROM workouts`).all() as { user: string }[];
    return rows.map((r) => r.user);
  }
}

import { eq, sql, count, isNull, and } from 'drizzle-orm';
import type { DrizzleDb } from '../../../db/drizzle.js';
import { workoutLifts, workoutCardios } from './schema.js';
import type {
  WorkoutRepository,
  WorkoutEntry,
  NewWorkoutLog,
  DeletedWorkoutEntry,
} from './workoutRepository.js';

export class DrizzleWorkoutRepository implements WorkoutRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly minWorkoutsForStreak: number = 3
  ) {}

  async countByUser(user: string): Promise<number> {
    const [liftRows, cardioRows] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(workoutLifts)
        .where(and(eq(workoutLifts.userId, user), isNull(workoutLifts.deletedAt))),
      this.db
        .select({ total: count() })
        .from(workoutCardios)
        .where(and(eq(workoutCardios.userId, user), isNull(workoutCardios.deletedAt))),
    ]);

    return (liftRows[0]?.total ?? 0) + (cardioRows[0]?.total ?? 0);
  }

  async listByUser(user: string, limit: number, offset: number): Promise<WorkoutEntry[]> {
    const rows = await this.db.execute<{
      created_at: string;
      workout_mode: string;
      activity: string;
      reps: number | null;
      sets: number | null;
      weight_kg: number | null;
      duration_minutes: number | null;
      distance_km: number | null;
    }>(sql`
      (
        SELECT created_at, 'lift' AS workout_mode, activity,
               reps, sets, weight_kg,
               NULL::real AS duration_minutes, NULL::real AS distance_km
        FROM workout_lifts
        WHERE user_id = ${user} AND deleted_at IS NULL
      )
      UNION ALL
      (
        SELECT created_at, 'cardio' AS workout_mode, activity,
               NULL::integer AS reps, NULL::integer AS sets, NULL::real AS weight_kg,
               duration_minutes, distance_km
        FROM workout_cardios
        WHERE user_id = ${user} AND deleted_at IS NULL
      )
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    return rows.map((r): WorkoutEntry => {
      if (r.workout_mode === 'cardio') {
        return {
          createdAt: r.created_at,
          workoutMode: 'cardio',
          type: r.activity,
          durationMinutes: r.duration_minutes ?? 0,
          distanceKm: r.distance_km ?? 0,
        };
      }
      return {
        createdAt: r.created_at,
        workoutMode: 'lift',
        type: r.activity,
        reps: r.reps ?? 0,
        sets: r.sets ?? 0,
        weight: r.weight_kg ?? 0,
      };
    });
  }

  async insertWorkoutLog(log: NewWorkoutLog): Promise<void> {
    if (log.workoutMode === 'lift') {
      await this.db.insert(workoutLifts).values({
        userId: log.userId,
        activity: log.type,
        reps: log.reps,
        sets: log.sets,
        weightKg: log.weight,
        createdAt: log.createdAtIso,
      });
    } else {
      await this.db.insert(workoutCardios).values({
        userId: log.userId,
        activity: log.type,
        durationMinutes: log.durationMinutes,
        distanceKm: log.distanceKm,
        createdAt: log.createdAtIso,
      });
    }
  }

  async listDistinctUsers(): Promise<string[]> {
    const rows = await this.db.execute<{ user_id: string }>(sql`
      SELECT DISTINCT user_id FROM (
        SELECT user_id FROM workout_lifts WHERE deleted_at IS NULL
        UNION
        SELECT user_id FROM workout_cardios WHERE deleted_at IS NULL
      ) AS combined
    `);

    return rows.map((r) => r.user_id);
  }

  async getQualifyingStreakDays(user: string, timezoneOffsetMinutes: number): Promise<string[]> {
    const offsetSeconds = timezoneOffsetMinutes * 60;

    const rows = await this.db.execute<{ day: string }>(sql`
      SELECT day, COUNT(*) AS cnt FROM (
        (
          SELECT DATE(created_at::timestamp + (INTERVAL '1 second' * ${offsetSeconds})) AS day
          FROM workout_lifts
          WHERE user_id = ${user} AND deleted_at IS NULL
        )
        UNION ALL
        (
          SELECT DATE(created_at::timestamp + (INTERVAL '1 second' * ${offsetSeconds})) AS day
          FROM workout_cardios
          WHERE user_id = ${user} AND deleted_at IS NULL
        )
      ) AS combined
      GROUP BY day
      HAVING COUNT(*) >= ${this.minWorkoutsForStreak}
      ORDER BY day DESC
    `);

    return rows.map((r) => r.day as string);
  }

  async getTodayCount(
    user: string,
    timezoneOffsetMinutes: number,
    nowIso: string
  ): Promise<number> {
    const offsetSeconds = timezoneOffsetMinutes * 60;
    const dateExpr = sql`DATE(created_at::timestamp + (INTERVAL '1 second' * ${offsetSeconds}))`;
    const todayExpr = sql`DATE(${nowIso}::timestamp + (INTERVAL '1 second' * ${offsetSeconds}))`;

    const rows = await this.db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*) AS cnt FROM (
        (
          SELECT created_at FROM workout_lifts
          WHERE user_id = ${user} AND ${dateExpr} = ${todayExpr} AND deleted_at IS NULL
        )
        UNION ALL
        (
          SELECT created_at FROM workout_cardios
          WHERE user_id = ${user} AND ${dateExpr} = ${todayExpr} AND deleted_at IS NULL
        )
      ) AS combined
    `);

    return Number(rows[0]?.cnt ?? 0);
  }

  async findLastByUser(user: string): Promise<DeletedWorkoutEntry | null> {
    const rows = await this.db.execute<{
      id: number;
      created_at: string;
      workout_mode: string;
      activity: string;
      reps: number | null;
      sets: number | null;
      weight_kg: number | null;
      duration_minutes: number | null;
      distance_km: number | null;
    }>(sql`
      (
        SELECT id, created_at, 'lift' AS workout_mode, activity,
               reps, sets, weight_kg,
               NULL::real AS duration_minutes, NULL::real AS distance_km
        FROM workout_lifts
        WHERE user_id = ${user} AND deleted_at IS NULL
      )
      UNION ALL
      (
        SELECT id, created_at, 'cardio' AS workout_mode, activity,
               NULL::integer AS reps, NULL::integer AS sets, NULL::real AS weight_kg,
               duration_minutes, distance_km
        FROM workout_cardios
        WHERE user_id = ${user} AND deleted_at IS NULL
      )
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (rows.length === 0) return null;

    const r = rows[0];
    if (r.workout_mode === 'cardio') {
      return {
        id: r.id,
        createdAt: r.created_at,
        workoutMode: 'cardio',
        type: r.activity,
        durationMinutes: r.duration_minutes ?? 0,
        distanceKm: r.distance_km ?? 0,
      };
    }
    return {
      id: r.id,
      createdAt: r.created_at,
      workoutMode: 'lift',
      type: r.activity,
      reps: r.reps ?? 0,
      sets: r.sets ?? 0,
      weight: r.weight_kg ?? 0,
    };
  }

  async softDeleteById(
    id: number,
    workoutMode: 'lift' | 'cardio',
    deletedAtIso: string
  ): Promise<void> {
    if (workoutMode === 'lift') {
      await this.db
        .update(workoutLifts)
        .set({ deletedAt: deletedAtIso })
        .where(eq(workoutLifts.id, id));
    } else {
      await this.db
        .update(workoutCardios)
        .set({ deletedAt: deletedAtIso })
        .where(eq(workoutCardios.id, id));
    }
  }
}

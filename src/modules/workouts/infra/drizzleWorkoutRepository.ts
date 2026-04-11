import { eq, sql, count } from 'drizzle-orm';
import type { DrizzleDb } from '../../../db/drizzle.js';
import { workouts } from './schema.js';
import type { WorkoutRepository, WorkoutEntry, NewWorkoutLog } from './workoutRepository.js';

export class DrizzleWorkoutRepository implements WorkoutRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly minWorkoutsForStreak: number = 3
  ) {}

  async countByUser(user: string): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(workouts)
      .where(eq(workouts.user, user));

    return rows[0]?.total ?? 0;
  }

  async listByUser(user: string, limit: number, offset: number): Promise<WorkoutEntry[]> {
    const rows = await this.db
      .select({
        createdAt: workouts.createdAt,
        workoutMode: workouts.workoutMode,
        type: workouts.type,
        reps: workouts.reps,
        sets: workouts.sets,
        weight: workouts.weight,
        durationMinutes: workouts.durationMinutes,
        distanceKm: workouts.distanceKm,
      })
      .from(workouts)
      .where(eq(workouts.user, user))
      .orderBy(sql`${workouts.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    return rows.map((r): WorkoutEntry => {
      if (r.workoutMode === 'cardio') {
        return {
          createdAt: r.createdAt,
          workoutMode: 'cardio',
          type: r.type,
          durationMinutes: r.durationMinutes,
          distanceKm: r.distanceKm,
        };
      }
      return {
        createdAt: r.createdAt,
        workoutMode: 'lift',
        type: r.type,
        reps: r.reps,
        sets: r.sets,
        weight: r.weight,
      };
    });
  }

  async insertWorkoutLog(log: NewWorkoutLog): Promise<void> {
    if (log.workoutMode === 'lift') {
      await this.db.insert(workouts).values({
        user: log.user,
        workoutMode: log.workoutMode,
        type: log.type,
        reps: log.reps,
        sets: log.sets,
        weight: log.weight,
        durationMinutes: 0,
        distanceKm: 0,
        createdAt: log.createdAtIso,
      });
    } else {
      await this.db.insert(workouts).values({
        user: log.user,
        workoutMode: log.workoutMode,
        type: log.type,
        reps: 0,
        sets: 0,
        weight: 0,
        durationMinutes: log.durationMinutes,
        distanceKm: log.distanceKm,
        createdAt: log.createdAtIso,
      });
    }
  }

  async listDistinctUsers(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ user: workouts.user }).from(workouts);

    return rows.map((r) => r.user);
  }

  async getQualifyingStreakDays(user: string, timezoneOffsetMinutes: number): Promise<string[]> {
    const offsetSeconds = timezoneOffsetMinutes * 60;
    const dayExpr = sql`DATE(${workouts.createdAt}::timestamp + INTERVAL '${sql.raw(String(offsetSeconds))} seconds')`;

    const rows = await this.db
      .select({
        day: dayExpr.as('day'),
        cnt: count().as('cnt'),
      })
      .from(workouts)
      .where(eq(workouts.user, user))
      .groupBy(dayExpr)
      .having(sql`COUNT(*) >= ${this.minWorkoutsForStreak}`)
      .orderBy(sql`day DESC`);

    return rows.map((r) => r.day as string);
  }

  async getTodayCount(
    user: string,
    timezoneOffsetMinutes: number,
    nowIso: string
  ): Promise<number> {
    const offsetSeconds = timezoneOffsetMinutes * 60;

    const rows = await this.db
      .select({ cnt: count() })
      .from(workouts)
      .where(
        sql`${workouts.user} = ${user} AND DATE(${workouts.createdAt}::timestamp + INTERVAL '${sql.raw(String(offsetSeconds))} seconds') = DATE(${nowIso}::timestamp + INTERVAL '${sql.raw(String(offsetSeconds))} seconds')`
      );

    return rows[0]?.cnt ?? 0;
  }
}

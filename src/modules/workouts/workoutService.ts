import { debug } from '../../logger.js';
import { computeStreaks } from './workoutStreaks.js';
import type { StreakInfo } from './workoutStreaks.js';
import type { WorkoutRepository, WorkoutEntry } from './infra/workoutRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import type { LiftPayload, CardioPayload } from './workoutParser.js';

export type WorkoutListResult = {
  rows: WorkoutEntry[];
  total: number;
  page: number;
  totalPages: number;
  streaks: StreakInfo;
};

export type WorkoutLogResult = {
  todayCount: number;
  streaks: StreakInfo | null;
};

export class WorkoutService {
  constructor(
    private readonly workoutRepository: WorkoutRepository,
    private readonly userRepository: UserRepository,
    readonly minWorkoutsForStreak: number = 3,
    private readonly workoutListLimit: number = 10
  ) {}

  async logLift(sender: string, payload: LiftPayload, now: Date): Promise<void> {
    await this.workoutRepository.insertWorkoutLog({
      userId: sender,
      workoutMode: 'lift',
      type: payload.activity,
      reps: payload.reps,
      sets: payload.sets,
      weight: payload.weight,
      createdAtIso: now.toISOString(),
    });

    debug(
      `💾 Workout saved: [lift] ${payload.activity} ${payload.reps}×${payload.sets} @ ${payload.weight === 0 ? 'bodyweight' : `${payload.weight}kg`}`
    );
  }

  async logCardio(sender: string, payload: CardioPayload, now: Date): Promise<void> {
    await this.workoutRepository.insertWorkoutLog({
      userId: sender,
      workoutMode: 'cardio',
      type: payload.activity,
      durationMinutes: payload.durationMinutes,
      distanceKm: payload.distanceKm,
      createdAtIso: now.toISOString(),
    });

    debug(
      `💾 Workout saved: [cardio] ${payload.activity} ${payload.durationMinutes}min${payload.distanceKm > 0 ? ` ${payload.distanceKm}km` : ''}`
    );
  }

  async getStreakAfterLog(
    sender: string,
    timezoneOffsetMinutes: number,
    now: Date
  ): Promise<WorkoutLogResult> {
    const todayCount = await this.workoutRepository.getTodayCount(
      sender,
      timezoneOffsetMinutes,
      now.toISOString()
    );

    const remaining = this.minWorkoutsForStreak - todayCount;

    let streaks: StreakInfo | null = null;
    if (remaining === 0) {
      const days = await this.workoutRepository.getQualifyingStreakDays(
        sender,
        timezoneOffsetMinutes
      );
      streaks = computeStreaks(days, timezoneOffsetMinutes, now);
    }

    return { todayCount, streaks };
  }

  async listWorkouts(
    sender: string,
    page: number,
    timezoneOffsetMinutes: number,
    now: Date
  ): Promise<WorkoutListResult> {
    const offset = (page - 1) * this.workoutListLimit;
    const total = await this.workoutRepository.countByUser(sender);
    const totalPages = Math.max(1, Math.ceil(total / this.workoutListLimit));

    const rows =
      total === 0 || page > totalPages
        ? []
        : await this.workoutRepository.listByUser(sender, this.workoutListLimit, offset);

    const days = await this.workoutRepository.getQualifyingStreakDays(
      sender,
      timezoneOffsetMinutes
    );
    const streaks = computeStreaks(days, timezoneOffsetMinutes, now);

    return { rows, total, page, totalPages, streaks };
  }

  async getStreaksByUser(
    userId: string,
    timezoneOffsetMinutes: number,
    now: Date
  ): Promise<StreakInfo> {
    const days = await this.workoutRepository.getQualifyingStreakDays(
      userId,
      timezoneOffsetMinutes
    );
    return computeStreaks(days, timezoneOffsetMinutes, now);
  }

  async listDistinctUsers(): Promise<string[]> {
    return this.workoutRepository.listDistinctUsers();
  }

  async getDisplayName(userId: string): Promise<string> {
    return this.userRepository.getDisplayName(userId);
  }
}

import { debug } from '../../logger.js';
import { MIN_WORKOUTS_FOR_STREAK, WORKOUT_LIST_LIMIT } from '../../config/env.js';
import { computeStreaks } from './workoutStreaks.js';
import type { StreakInfo } from './workoutStreaks.js';
import type { WorkoutRepository, WorkoutRow } from './infra/workoutRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import type { LiftPayload, CardioPayload } from './workoutParser.js';
import type { UserStreak } from './workoutPresenter.js';
import {
  listGroupMemberIdentities,
  resolveNormalizedBotUserId,
  type BotInfoClientLike,
  type GroupMemberClientLike,
} from '../../adapters/whatsapp/waId.js';

export type WorkoutListResult = {
  rows: WorkoutRow[];
  total: number;
  page: number;
  totalPages: number;
  streaks: StreakInfo;
};

export type WorkoutLogResult = {
  todayCount: number;
  streaks: StreakInfo | null;
};

export type DigestClientLike = GroupMemberClientLike & BotInfoClientLike;

export class WorkoutService {
  constructor(
    private readonly workoutRepository: WorkoutRepository,
    private readonly userRepository: UserRepository
  ) {}

  async logLift(sender: string, payload: LiftPayload, now: Date): Promise<void> {
    await this.workoutRepository.insertWorkoutLog({
      user: sender,
      workoutMode: 'lift',
      type: payload.activity,
      reps: payload.reps,
      sets: payload.sets,
      weight: payload.weight,
      durationMinutes: 0,
      distanceKm: 0,
      createdAtIso: now.toISOString(),
    });

    debug(
      `💾 Workout saved: [lift] ${payload.activity} ${payload.reps}×${payload.sets} @ ${payload.weight === 0 ? 'bodyweight' : `${payload.weight}kg`}`
    );
  }

  async logCardio(sender: string, payload: CardioPayload, now: Date): Promise<void> {
    await this.workoutRepository.insertWorkoutLog({
      user: sender,
      workoutMode: 'cardio',
      type: payload.activity,
      reps: 0,
      sets: 0,
      weight: 0,
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

    const remaining = MIN_WORKOUTS_FOR_STREAK - todayCount;

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
    const offset = (page - 1) * WORKOUT_LIST_LIMIT;
    const total = await this.workoutRepository.countByUser(sender);
    const totalPages = Math.max(1, Math.ceil(total / WORKOUT_LIST_LIMIT));

    const rows =
      total === 0 || page > totalPages
        ? []
        : await this.workoutRepository.listByUser(sender, WORKOUT_LIST_LIMIT, offset);

    const days = await this.workoutRepository.getQualifyingStreakDays(
      sender,
      timezoneOffsetMinutes
    );
    const streaks = computeStreaks(days, timezoneOffsetMinutes, now);

    return { rows, total, page, totalPages, streaks };
  }

  async getDigestStandings(
    client: DigestClientLike,
    groupChatId: string,
    timezoneOffsetMinutes: number,
    now: Date
  ): Promise<UserStreak[]> {
    const [memberIdentities, botUserId, dbUsers] = await Promise.all([
      listGroupMemberIdentities(client, groupChatId),
      resolveNormalizedBotUserId(client),
      this.workoutRepository.listDistinctUsers(),
    ]);

    const groupMemberIdentities = botUserId
      ? memberIdentities.filter((member) => !member.aliases.includes(botUserId))
      : memberIdentities;

    const knownUsers = new Set(dbUsers);
    const targetUserIdSet = new Set<string>();

    for (const member of groupMemberIdentities) {
      const matchedDbId = member.aliases.find((alias: string) => knownUsers.has(alias));
      const dbUserId = matchedDbId ?? member.primaryId;
      targetUserIdSet.add(dbUserId);
    }

    const targetUserIds = Array.from(targetUserIdSet);

    if (targetUserIds.length === 0) {
      return [];
    }

    const standingsRaw = await Promise.all(
      targetUserIds.map(async (userId) => {
        const days = await this.workoutRepository.getQualifyingStreakDays(
          userId,
          timezoneOffsetMinutes
        );
        const streaks = computeStreaks(days, timezoneOffsetMinutes, now);
        const name = await this.userRepository.getDisplayName(userId);
        return { name, current: streaks.current, best: streaks.best };
      })
    );

    return standingsRaw
      .filter((standing) => standing.current > 0 || standing.best > 0)
      .sort((a, b) => b.current - a.current || b.best - a.best);
  }
}

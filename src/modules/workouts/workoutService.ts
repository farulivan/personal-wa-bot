import { debug } from '../../logger.js';
import { computeStreaks } from './workoutStreaks.js';
import type { StreakInfo } from './workoutStreaks.js';
import type {
  WorkoutRepository,
  WorkoutEntry,
  DeletedWorkoutEntry,
} from './infra/workoutRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import type { LiftPayload, CardioPayload } from './workoutParser.js';

export type WorkoutListResult = {
  rows: WorkoutEntry[];
  total: number;
  page: number;
  totalPages: number;
  streaks: StreakInfo;
};

export type WorkoutLeaderboardEntry = {
  user: string;
  sessionsInMonth: number;
  currentStreak: number;
  bestStreak: number;
};

export function getCurrentMonthDateRange(
  now: Date,
  timezoneOffsetMinutes: number
): { startDateInclusive: string; endDateInclusive: string } {
  const local = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    startDateInclusive: `${year}-${String(month).padStart(2, '0')}-01`,
    endDateInclusive: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function getLastMonthDateRange(
  now: Date,
  timezoneOffsetMinutes: number
): { startDateInclusive: string; endDateInclusive: string; monthLabel: string } {
  const local = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;

  const lastMonthDate = new Date(Date.UTC(year, month - 2, 1));
  const lastYear = lastMonthDate.getUTCFullYear();
  const lastMonth = lastMonthDate.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(lastYear, lastMonth, 0)).getUTCDate();

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  return {
    startDateInclusive: `${lastYear}-${String(lastMonth).padStart(2, '0')}-01`,
    endDateInclusive: `${lastYear}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    monthLabel: `${monthNames[lastMonth - 1]} ${lastYear}`,
  };
}

export type WorkoutLogResult = {
  todayCount: number;
  streaks: StreakInfo | null;
};

export const UNDO_WINDOW_MS = 5 * 60 * 1000;

export type UndoResult =
  | { undone: true; entry: WorkoutEntry }
  | { undone: false; reason: 'no_logs' }
  | { undone: false; reason: 'too_late'; entry: WorkoutEntry };

function toWorkoutEntry(row: DeletedWorkoutEntry): WorkoutEntry {
  if (row.workoutMode === 'cardio') {
    return {
      createdAt: row.createdAt,
      workoutMode: row.workoutMode,
      type: row.type,
      durationMinutes: row.durationMinutes,
      distanceKm: row.distanceKm,
    };
  }
  return {
    createdAt: row.createdAt,
    workoutMode: row.workoutMode,
    type: row.type,
    reps: row.reps,
    sets: row.sets,
    weight: row.weight,
  };
}

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

  async getLeaderboard(
    timezoneOffsetMinutes: number,
    now: Date
  ): Promise<{ entries: WorkoutLeaderboardEntry[] }> {
    const range = getCurrentMonthDateRange(now, timezoneOffsetMinutes);
    const userIds = await this.workoutRepository.listDistinctUsers();
    const raw = await Promise.all(
      userIds.map(async (userId) => {
        const days = await this.workoutRepository.getQualifyingStreakDays(
          userId,
          timezoneOffsetMinutes
        );
        const streak = computeStreaks(days, timezoneOffsetMinutes, now);
        const sessionsInMonth = await this.workoutRepository.countSessionsByUserInDateRange(
          userId,
          timezoneOffsetMinutes,
          range.startDateInclusive,
          range.endDateInclusive
        );
        return { userId, currentStreak: streak.current, bestStreak: streak.best, sessionsInMonth };
      })
    );
    const filtered = raw.filter(
      (e) => e.sessionsInMonth > 0 || e.currentStreak > 0 || e.bestStreak > 0
    );
    const namesById = await this.userRepository.getDisplayNamesByIds(filtered.map((e) => e.userId));
    const entries = filtered.map((e) => ({
      user: namesById.get(e.userId) ?? e.userId,
      sessionsInMonth: e.sessionsInMonth,
      currentStreak: e.currentStreak,
      bestStreak: e.bestStreak,
    }));
    return { entries };
  }

  async getLastMonthLeaderboard(
    timezoneOffsetMinutes: number,
    now: Date
  ): Promise<{ entries: WorkoutLeaderboardEntry[]; monthLabel: string }> {
    const { startDateInclusive, endDateInclusive, monthLabel } = getLastMonthDateRange(
      now,
      timezoneOffsetMinutes
    );
    const userIds = await this.workoutRepository.listDistinctUsers();
    const raw = await Promise.all(
      userIds.map(async (userId) => {
        const days = await this.workoutRepository.getQualifyingStreakDays(
          userId,
          timezoneOffsetMinutes
        );
        const streak = computeStreaks(days, timezoneOffsetMinutes, now);
        const sessionsInMonth = await this.workoutRepository.countSessionsByUserInDateRange(
          userId,
          timezoneOffsetMinutes,
          startDateInclusive,
          endDateInclusive
        );
        return { userId, currentStreak: streak.current, bestStreak: streak.best, sessionsInMonth };
      })
    );
    const filtered = raw.filter((e) => e.sessionsInMonth > 0);
    const namesById = await this.userRepository.getDisplayNamesByIds(filtered.map((e) => e.userId));
    const entries = filtered.map((e) => ({
      user: namesById.get(e.userId) ?? e.userId,
      sessionsInMonth: e.sessionsInMonth,
      currentStreak: e.currentStreak,
      bestStreak: e.bestStreak,
    }));
    return { entries, monthLabel };
  }

  async undoLastLog(sender: string, now: Date): Promise<UndoResult> {
    const last = await this.workoutRepository.findLastByUser(sender);
    if (!last) {
      return { undone: false, reason: 'no_logs' };
    }

    const elapsed = now.getTime() - new Date(last.createdAt).getTime();
    if (elapsed > UNDO_WINDOW_MS) {
      return { undone: false, reason: 'too_late', entry: toWorkoutEntry(last) };
    }

    await this.workoutRepository.softDeleteById(last.id, last.workoutMode, now.toISOString());

    const entry = toWorkoutEntry(last);
    debug(`🗑️ Workout undone: [${entry.workoutMode}] ${entry.type} (${entry.createdAt})`);

    return { undone: true, entry };
  }
}

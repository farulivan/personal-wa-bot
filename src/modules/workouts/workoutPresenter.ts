import type { WorkoutEntry } from './infra/workoutRepository.js';
import type { StreakInfo } from '../../shared/streaks.js';
import { UNDO_WINDOW_MS } from './workoutService.js';
import type { WorkoutLeaderboardEntry } from './workoutService.js';
import { formatMentionTag, phoneToMentionJid } from '../../shared/mentions.js';

const WORKOUT_LEADERBOARD_LIMIT = 10;

export function formatWorkoutList(
  rows: WorkoutEntry[],
  timezoneOffsetMinutes: number,
  now: Date
): string {
  return rows
    .map((r) => {
      const workoutDate = new Date(r.createdAt);
      const userWorkoutDate = new Date(workoutDate.getTime() + timezoneOffsetMinutes * 60000);

      const userNow = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
      const userToday = new Date(
        userNow.getUTCFullYear(),
        userNow.getUTCMonth(),
        userNow.getUTCDate()
      );
      const userYesterday = new Date(userToday.getTime() - 86400000);
      const workoutDateOnly = new Date(
        userWorkoutDate.getUTCFullYear(),
        userWorkoutDate.getUTCMonth(),
        userWorkoutDate.getUTCDate()
      );

      let dateStr: string;
      if (workoutDateOnly.getTime() === userToday.getTime()) {
        dateStr = 'Today';
      } else if (workoutDateOnly.getTime() === userYesterday.getTime()) {
        dateStr = 'Yesterday';
      } else {
        const [year, month, day] = r.createdAt.split('T')[0].split('-');
        dateStr = `${year}/${month}/${day}`;
      }

      if (r.workoutMode === 'cardio') {
        const durationStr = Number.isInteger(r.durationMinutes)
          ? `${r.durationMinutes}min`
          : `${r.durationMinutes.toFixed(1)}min`;
        const distanceStr = r.distanceKm > 0 ? ` | ${r.distanceKm}km` : '';
        return `• ${dateStr} – [cardio] ${r.type} | ${durationStr}${distanceStr}`;
      }

      const weightStr = r.weight === 0 ? 'bodyweight' : `${r.weight}kg`;
      return `• ${dateStr} – [lift] ${r.type} | ${r.reps} × ${r.sets} @ ${weightStr}`;
    })
    .join('\n');
}

export function formatLiftLogResponse(
  workoutType: string,
  reps: number,
  sets: number,
  weight: number,
  timezoneOffsetMinutes: number,
  now: Date
): string {
  const weightLabel = weight === 0 ? 'bodyweight' : `${weight}kg`;

  const userNow = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
  const userHour = userNow.getUTCHours();

  let timeResponse: string;
  if (userHour >= 5 && userHour < 11) {
    timeResponse = 'Early grind 💯\nStarting the day right.';
  } else if (userHour >= 11 && userHour < 16) {
    timeResponse = 'Midday work 👊\nStaying consistent.';
  } else if (userHour >= 16 && userHour < 21) {
    timeResponse = 'After-hours effort 💪\nWay to show up.';
  } else {
    timeResponse = "Late session 👀\nThat's commitment.";
  }

  return `Logged 💪\n${workoutType}\n${reps} × ${sets} @ ${weightLabel}\n\n${timeResponse}`;
}

export function formatCardioLogResponse(
  activity: string,
  durationMinutes: number,
  distanceKm: number,
  timezoneOffsetMinutes: number,
  now: Date
): string {
  const userNow = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
  const userHour = userNow.getUTCHours();

  let timeResponse: string;
  if (userHour >= 5 && userHour < 11) {
    timeResponse = 'Strong start 🚀\nCardio done before noon.';
  } else if (userHour >= 11 && userHour < 16) {
    timeResponse = 'Midday momentum 🏃\nKeep that engine warm.';
  } else if (userHour >= 16 && userHour < 21) {
    timeResponse = 'Evening push 🔥\nNice consistency.';
  } else {
    timeResponse = 'Late grind 🌙\nDiscipline on point.';
  }

  const distancePart = distanceKm > 0 ? ` | ${distanceKm}km` : '';
  return `Logged 💪\n${activity}\n${durationMinutes}min${distancePart}\n\n${timeResponse}`;
}

export function formatStreakNote(
  todayCount: number,
  minWorkoutsForStreak: number,
  streaks: StreakInfo | null
): string {
  const remaining = minWorkoutsForStreak - todayCount;

  if (remaining > 0) {
    return `\n\n${remaining} more to go today to keep the streak alive 🔥`;
  }

  if (remaining === 0 && streaks) {
    return `\n\n🔥 Day counted! Streak: ${streaks.current} day${streaks.current !== 1 ? 's' : ''}. Keep it rolling.`;
  }

  // Already qualified earlier, just acknowledge
  return `\n\n🔥 Already locked in today. Extra reps never hurt.`;
}

export function formatStreakSection(streaks: StreakInfo): string {
  if (streaks.current <= 0 && streaks.best <= 0) return '';

  let section = `\n\n🔥 Streak: ${streaks.current} day${streaks.current !== 1 ? 's' : ''}`;
  if (streaks.best > streaks.current) {
    section += ` | Best: ${streaks.best} days`;
  }
  return section;
}

export function formatListPageFooter(page: number, totalPages: number): string {
  if (totalPages <= 1) return '';

  let footer = `\n\n📄 Page ${page} of ${totalPages}`;
  if (page < totalPages) {
    footer += ` — #workout list ${page + 1} for next`;
  }
  return footer;
}

export function formatEmptyListMessage(): string {
  return (
    `Nothing logged yet 👀\n\n` +
    `Start with:\n` +
    `#workout lift push up 20reps 4sets 10kg\n` +
    `or\n` +
    `#workout cardio run 30min 5km\n\n` +
    `Let's get the first one in 💪`
  );
}

export function formatPageOverflowMessage(page: number, totalPages: number): string {
  return (
    `That's all the history 👀\n` +
    `You're on page ${page} but the last page is ${totalPages}.\n\n` +
    `Try: #workout list${totalPages > 1 ? ` ${totalPages}` : ''}`
  );
}

export function formatUndoSuccess(entry: WorkoutEntry): string {
  if (entry.workoutMode === 'cardio') {
    const distancePart = entry.distanceKm > 0 ? ` | ${entry.distanceKm}km` : '';
    return `Undone 🗑️\n[cardio] ${entry.type} | ${entry.durationMinutes}min${distancePart}`;
  }

  const weightStr = entry.weight === 0 ? 'bodyweight' : `${entry.weight}kg`;
  return `Undone 🗑️\n[lift] ${entry.type} | ${entry.reps} × ${entry.sets} @ ${weightStr}`;
}

export function formatUndoNoLogs(): string {
  return `Nothing to undo 👀\nNo workout logs found.`;
}

export function formatUndoTooLate(entry: WorkoutEntry): string {
  const windowMinutes = UNDO_WINDOW_MS / 60_000;
  const detail =
    entry.workoutMode === 'cardio'
      ? `[cardio] ${entry.type} | ${entry.durationMinutes}min${entry.distanceKm > 0 ? ` | ${entry.distanceKm}km` : ''}`
      : `[lift] ${entry.type} | ${entry.reps} × ${entry.sets} @ ${entry.weight === 0 ? 'bodyweight' : `${entry.weight}kg`}`;

  return (
    `Can't undo ⏳\n` +
    `Undo is only available within ${windowMinutes} minutes of logging.\n\n` +
    `Last entry:\n${detail}`
  );
}

const STREAK_RULE_NOTE =
  '💡 Streak rule: one rest day is fine. Miss two days in a row and your streak resets.';

function formatStreakAtRiskWarning(
  entries: WorkoutLeaderboardEntry[]
): { text: string; mentions: string[] } | null {
  const atRisk = entries.filter((e) => e.atRisk);
  if (atRisk.length === 0) return null;

  const tagged = atRisk
    .map((e) => (e.phoneNumber ? formatMentionTag(e.phoneNumber) : e.user))
    .join(', ');
  const mentions = atRisk
    .filter((e): e is WorkoutLeaderboardEntry & { phoneNumber: string } => e.phoneNumber !== null)
    .map((e) => phoneToMentionJid(e.phoneNumber));

  return {
    text: `Heads up ${tagged}: workout today or your streak ends tomorrow.`,
    mentions,
  };
}

export function rankLeaderboardEntries(
  entries: WorkoutLeaderboardEntry[],
  limit: number = WORKOUT_LEADERBOARD_LIMIT
): WorkoutLeaderboardEntry[] {
  return [...entries]
    .sort(
      (a, b) =>
        b.sessionsInMonth - a.sessionsInMonth ||
        b.currentStreak - a.currentStreak ||
        b.bestStreak - a.bestStreak ||
        a.user.localeCompare(b.user)
    )
    .slice(0, limit);
}

function renderLeaderboardBody(entries: WorkoutLeaderboardEntry[]): string {
  const medals = ['🥇', '🥈', '🥉'];
  return entries
    .map((e, i) => {
      const prefix = medals[i] ?? '🌱';
      const bestLabel = `${e.bestStreak} day${e.bestStreak !== 1 ? 's' : ''}`;
      const bestPart = e.bestStreak > e.currentStreak ? ` (Best ${bestLabel})` : '';
      const currentLabel = `${e.currentStreak} day${e.currentStreak !== 1 ? 's' : ''}`;
      const streakPart =
        e.currentStreak > 0 || e.bestStreak > 0 ? ` | 🔥 Streak ${currentLabel}${bestPart}` : '';
      const sessionLabel = `${e.sessionsInMonth} session${e.sessionsInMonth !== 1 ? 's' : ''}`;
      return `${prefix} ${e.user}\n   🏋️ ${sessionLabel}${streakPart}`;
    })
    .join('\n');
}

export function formatLeaderboardMessage(entries: WorkoutLeaderboardEntry[]): {
  text: string;
  mentions: string[];
} {
  if (entries.length === 0) {
    return {
      text:
        `Workout Leaderboard This Month 🏆\n\n` +
        `No workouts logged this month 👀\n\n` +
        `Get started: #workout lift push up 20reps 4sets\n\n` +
        STREAK_RULE_NOTE,
      mentions: [],
    };
  }

  const warning = formatStreakAtRiskWarning(entries);
  const warningPrefix = warning != null ? `${warning.text}\n\n` : '';
  return {
    text:
      `${warningPrefix}` +
      `Workout Leaderboard This Month 🏆\n\n` +
      `${renderLeaderboardBody(entries)}\n\n` +
      STREAK_RULE_NOTE,
    mentions: warning?.mentions ?? [],
  };
}

export function formatMonthlyDigestMessage(
  entries: WorkoutLeaderboardEntry[],
  monthLabel: string
): string {
  if (entries.length === 0) {
    return (
      `📅 Monthly Workout Recap — ${monthLabel} 🏆\n\n` +
      `No workouts were logged last month 👀\n\n` +
      `New month, new goals. Let's get moving! 💪`
    );
  }

  return (
    `📅 Monthly Workout Recap — ${monthLabel} 🏆\n\n` +
    `${renderLeaderboardBody(entries)}\n\n` +
    `New month, new goals. Let's go! 💪`
  );
}

export function formatDigestMessage(entries: WorkoutLeaderboardEntry[]): {
  text: string;
  mentions: string[];
} {
  if (entries.length === 0) {
    return {
      text:
        `Good morning team 👋\n\n` +
        `Workout Leaderboard This Month 🏆\n\n` +
        `No workouts logged this month 👀\n\n` +
        `Get started: #workout lift push up 20reps 4sets\n\n` +
        STREAK_RULE_NOTE,
      mentions: [],
    };
  }

  const warning = formatStreakAtRiskWarning(entries);
  const warningBlock = warning != null ? `${warning.text}\n\n` : '';
  return {
    text:
      `Good morning team 👋\n\n` +
      `${warningBlock}` +
      `Workout Leaderboard This Month 🏆\n\n` +
      `${renderLeaderboardBody(entries)}\n\n` +
      `${STREAK_RULE_NOTE}\n\n` +
      `Keep showing up. Consistency wins. 💪`,
    mentions: warning?.mentions ?? [],
  };
}

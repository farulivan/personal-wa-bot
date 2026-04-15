import type { WorkoutEntry } from './infra/workoutRepository.js';
import type { StreakInfo } from './workoutStreaks.js';

export type UserStreak = {
  name: string;
  current: number;
  best: number;
};

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

export function formatDigestMessage(standings: UserStreak[]): string {
  const top3 = standings.slice(0, 3);
  const rest = standings.slice(3);

  const top3Lines = top3.map((user, index) => {
    const medal = ['🥇', '🥈', '🥉'][index];
    return `${medal} ${user.name} – ${user.current} days (best: ${user.best})`;
  });

  const restLines = rest.map((user) => {
    return `🔹 ${user.name} – ${user.current} days (best: ${user.best})`;
  });

  return `Morning team 👋\n\n${top3Lines.join('\n')}\n\n${restLines.join('\n')}\n\nKeep showing up. Consistency wins. 💪`;
}

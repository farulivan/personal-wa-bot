import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { CommandInvocation } from '../../app/parseCommand.js';
import { parseKeyValue } from '../../app/parseKeyValue.js';
import { debug } from '../../logger.js';
import { computeStreaks, getTodayWorkoutCount } from './workoutStreaks.js';
import { MIN_WORKOUTS_FOR_STREAK, WORKOUT_LIST_LIMIT } from '../../app/constants.js';

const WORKOUT_NAMESPACE = 'workout';

type WeightResult = { ok: true; value: number } | { ok: false; error: string };

function parseWeight(raw: string): WeightResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: 0 };

  const match = trimmed.match(/^([\d,.]+)\s*(.*)$/);
  if (!match) return { ok: true, value: 0 };

  const numStr = match[1].replace(',', '.');
  const unit = match[2].trim().toLowerCase();

  if (unit && unit !== 'kg') {
    return {
      ok: false,
      error:
        `We only track in kg here ⚖️\n\n` +
        `Got "${trimmed}" — convert that to kg and send it again.\n\n` +
        `Quick math never hurt nobody 💪`,
    };
  }

  const value = Number(numStr);
  if (isNaN(value)) return { ok: true, value: 0 };

  return { ok: true, value };
}

type WorkoutRow = {
  created_at: string;
  type: string;
  reps: number;
  sets: number;
  weight: number;
};

function formatWorkoutList(rows: WorkoutRow[], timezoneOffsetMinutes: number, now: Date): string {
  return rows
    .map((r) => {
      const workoutDate = new Date(r.created_at);
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
        const [year, month, day] = r.created_at.split('T')[0].split('-');
        dateStr = `${year}/${month}/${day}`;
      }

      const weightStr = r.weight === 0 ? 'bodyweight' : `${r.weight}kg`;
      return `• ${dateStr} – ${r.type} | ${r.reps} × ${r.sets} @ ${weightStr}`;
    })
    .join('\n');
}

function toWorkoutLogResponse(
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

function parsePageNumber(firstLine: string): number {
  const tokens = firstLine.trim().split(/\s+/).filter(Boolean);
  const pageToken = tokens.find((t) => /^\d+$/.test(t));
  return pageToken ? Math.max(1, Number(pageToken)) : 1;
}

async function handleWorkoutList(
  ctx: Parameters<NamespaceHandler>[0],
  invocation: CommandInvocation
): Promise<string> {
  const now = ctx.now();
  const page = parsePageNumber(invocation.firstLine);
  const offset = (page - 1) * WORKOUT_LIST_LIMIT;

  const totalRow = ctx.db
    .prepare(`SELECT COUNT(*) AS total FROM workouts WHERE user = ?`)
    .get(ctx.sender) as { total: number };

  const totalPages = Math.max(1, Math.ceil(totalRow.total / WORKOUT_LIST_LIMIT));

  if (totalRow.total === 0) {
    return (
      `Nothing logged yet 👀\n\n` +
      `Start with:\n` +
      `#workout\n\n` +
      `Let's get the first one in 💪`
    );
  }

  if (page > totalPages) {
    return (
      `That's all the history 👀\n` +
      `You're on page ${page} but the last page is ${totalPages}.\n\n` +
      `Try: #workout --list${totalPages > 1 ? ` ${totalPages}` : ''}`
    );
  }

  const rows = ctx.db
    .prepare(
      `SELECT created_at, type, reps, sets, weight FROM workouts 
     WHERE user = ? 
     ORDER BY created_at DESC 
     LIMIT ? OFFSET ?`
    )
    .all(ctx.sender, WORKOUT_LIST_LIMIT, offset) as WorkoutRow[];

  const list = formatWorkoutList(rows, ctx.timezoneOffsetMinutes, now);

  const streaks = computeStreaks(ctx.db, ctx.sender, ctx.timezoneOffsetMinutes, now);
  let streakSection = '';
  if (streaks.current > 0 || streaks.best > 0) {
    streakSection = `\n\n🔥 Streak: ${streaks.current} day${streaks.current !== 1 ? 's' : ''}`;
    if (streaks.best > streaks.current) {
      streakSection += ` | Best: ${streaks.best} days`;
    }
  }

  let pageFooter = '';
  if (totalPages > 1) {
    pageFooter = `\n\n📄 Page ${page} of ${totalPages}`;
    if (page < totalPages) {
      pageFooter += ` — #workout --list ${page + 1} for next`;
    }
  }

  debug(`📋 Listed ${rows.length} workouts (page ${page}/${totalPages})`);
  return `Recent work 💪\n\n${list}${streakSection}${pageFooter}`;
}

async function handleWorkoutLog(
  ctx: Parameters<NamespaceHandler>[0],
  invocation: CommandInvocation
): Promise<string> {
  const data = parseKeyValue(invocation.rawText);

  const implicitType =
    invocation.subcommand !== 'log' && invocation.subcommand !== 'list'
      ? invocation.subcommand
      : '';

  const type = data.type || implicitType;

  if (!type || !data.reps || !data.sets) {
    return (
      "Hmm 🤔 that didn't go through.\n\n" +
      'Use this format:\n' +
      '#workout\n' +
      'type: push up\n' +
      'reps: 20\n' +
      'sets: 4\n' +
      'weight: 10 (optional)\n\n' +
      `(weight is in kg, leave it blank for bodyweight)\n\n` +
      `Try again 💪`
    );
  }

  const now = ctx.now();
  const weightResult = parseWeight(data.weight || '');
  if (!weightResult.ok) return weightResult.error;
  const weight = weightResult.value;

  const stmt = ctx.db.prepare(
    `INSERT INTO workouts (user, type, reps, sets, weight, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  stmt.run(ctx.sender, type, Number(data.reps), Number(data.sets), weight, now.toISOString());

  debug(
    `💾 Workout saved: ${type} ${Number(data.reps)}×${Number(data.sets)} @ ${weight === 0 ? 'bodyweight' : `${weight}kg`}`
  );

  const logResponse = toWorkoutLogResponse(
    type,
    Number(data.reps),
    Number(data.sets),
    weight,
    ctx.timezoneOffsetMinutes,
    now
  );

  const todayCount = getTodayWorkoutCount(ctx.db, ctx.sender, ctx.timezoneOffsetMinutes, now);
  const remaining = MIN_WORKOUTS_FOR_STREAK - todayCount;

  let streakNote: string;
  if (remaining > 0) {
    streakNote = `\n\n${remaining} more to go today to keep the streak alive 🔥`;
  } else if (remaining === 0) {
    const streaks = computeStreaks(ctx.db, ctx.sender, ctx.timezoneOffsetMinutes, now);
    streakNote = `\n\n🔥 Day counted! Streak: ${streaks.current} day${streaks.current !== 1 ? 's' : ''}. Keep it rolling.`;
  } else {
    // Already qualified earlier, just acknowledge
    streakNote = `\n\n🔥 Already locked in today. Extra reps never hurt.`;
  }

  return logResponse + streakNote;
}

export function createWorkoutNamespaceHandler(): NamespaceHandler {
  return async (ctx, invocation) => {
    if (invocation.namespace !== WORKOUT_NAMESPACE) return null;

    if (invocation.subcommand === 'list') {
      return handleWorkoutList(ctx, invocation);
    }

    return handleWorkoutLog(ctx, invocation);
  };
}

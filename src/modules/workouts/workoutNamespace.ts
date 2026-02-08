import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { CommandInvocation } from '../../app/parseCommand.js';
import { parseKeyValue } from '../../app/parseKeyValue.js';
import { debug } from '../../logger.js';

const WORKOUT_NAMESPACE = 'workout';

type WorkoutRow = {
  created_at: string;
  type: string;
  reps: number;
  sets: number;
  weight: number;
};

function formatWorkoutList(
  rows: WorkoutRow[],
  timezoneOffsetMinutes: number,
  now: Date
): string {
  return rows
    .map((r) => {
      const workoutDate = new Date(r.created_at);
      const userWorkoutDate = new Date(workoutDate.getTime() + timezoneOffsetMinutes * 60000);

      const userNow = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
      const userToday = new Date(userNow.getUTCFullYear(), userNow.getUTCMonth(), userNow.getUTCDate());
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

async function handleWorkoutList(ctx: Parameters<NamespaceHandler>[0]): Promise<string> {
  const now = ctx.now();
  const stmt = ctx.db.prepare(
    `SELECT created_at, type, reps, sets, weight FROM workouts 
     WHERE user = ? 
     ORDER BY created_at DESC 
     LIMIT 10`
  );

  const rows = stmt.all(ctx.sender) as WorkoutRow[];

  if (rows.length === 0) {
    return (
      `Nothing logged yet 👀\n\n` +
      `Start with:\n` +
      `#workout\n\n` +
      `Let's get the first one in 💪`
    );
  }

  const list = formatWorkoutList(rows, ctx.timezoneOffsetMinutes, now);
  debug(`📋 Listed ${rows.length} workouts`);
  return `Recent work 💪\n\n${list}`;
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
  const weight = data.weight ? Number(data.weight) : 0;

  const stmt = ctx.db.prepare(
    `INSERT INTO workouts (user, type, reps, sets, weight, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  stmt.run(
    ctx.sender,
    type,
    Number(data.reps),
    Number(data.sets),
    weight,
    now.toISOString()
  );

  debug(
    `💾 Workout saved: ${type} ${Number(data.reps)}×${Number(data.sets)} @ ${weight === 0 ? 'bodyweight' : `${weight}kg`}`
  );

  return toWorkoutLogResponse(type, Number(data.reps), Number(data.sets), weight, ctx.timezoneOffsetMinutes, now);
}

export function createWorkoutNamespaceHandler(): NamespaceHandler {
  return async (ctx, invocation) => {
    if (invocation.namespace !== WORKOUT_NAMESPACE) return null;

    if (invocation.subcommand === 'list') {
      return handleWorkoutList(ctx);
    }

    return handleWorkoutLog(ctx, invocation);
  };
}

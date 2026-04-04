import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { CommandInvocation } from '../../app/parseCommand.js';
import { debug } from '../../logger.js';
import { computeStreaks } from './workoutStreaks.js';
import { MIN_WORKOUTS_FOR_STREAK, WORKOUT_LIST_LIMIT } from '../../app/constants.js';
import type { WorkoutRepository, WorkoutRow } from './infra/workoutRepository.js';

const WORKOUT_NAMESPACE = 'workout';

type LiftPayload = {
  mode: 'lift';
  activity: string;
  reps: number;
  sets: number;
  weight: number;
};

type CardioPayload = {
  mode: 'cardio';
  activity: string;
  durationMinutes: number;
  distanceKm: number;
};

type ParseWorkoutPayloadResult =
  | { ok: true; payload: LiftPayload | CardioPayload }
  | { ok: false; message: string };

type DurationParseResult = { ok: true; minutes: number } | { ok: false; message: string };

type DistanceParseResult = { ok: true; distanceKm: number } | { ok: false; message: string };

function tokenize(firstLine: string): string[] {
  return firstLine.trim().split(/\s+/).filter(Boolean);
}

function isLegacyMultiline(rawText: string): boolean {
  return /\n/.test(rawText) || /\btype\s*:|\breps\s*:|\bsets\s*:|\bweight\s*:/i.test(rawText);
}

function workoutHelpMessage(): string {
  return (
    `Use explicit workout mode now:\n\n` +
    `• #workout lift <activity> <repsToken> <setsToken> [weightToken]\n` +
    `  Example: #workout lift push up 20reps 4sets 10kg\n` +
    `  Also valid: 20rep / 4set\n\n` +
    `• #workout cardio <activity> <durationToken> [distanceToken]\n` +
    `  Example: #workout cardio run 30min 5km\n` +
    `  Duration units: min, hour\n` +
    `  Distance unit: km\n\n` +
    `• #workout --list\n` +
    `• #workout --list 2`
  );
}

function parsePositiveIntegerFromToken(token: string, regex: RegExp): number | null {
  const match = token.toLowerCase().match(regex);
  if (!match || !match[1]) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) return null;
  return value;
}

function parseWeightFromToken(token: string): WeightResult {
  const match = token.toLowerCase().match(/^(\d+(?:[.,]\d+)?)kg$/);
  if (!match || !match[1]) {
    return {
      ok: false,
      error: `Weight token must use kg format, e.g. 10kg.`,
    };
  }

  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) {
    return {
      ok: false,
      error: `Weight value is invalid. Use positive number with kg, e.g. 12kg.`,
    };
  }

  return { ok: true, value };
}

function parseDurationToken(token: string): DurationParseResult {
  const match = token.toLowerCase().match(/^(\d+(?:[.,]\d+)?)(min|hour)$/);
  if (!match || !match[1] || !match[2]) {
    return {
      ok: false,
      message: `Duration must be attached token with min/hour, e.g. 30min or 1hour.`,
    };
  }

  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) {
    return {
      ok: false,
      message: `Duration must be greater than 0.`,
    };
  }

  const unit = match[2];
  const minutes = unit === 'hour' ? value * 60 : value;

  return { ok: true, minutes };
}

function parseDistanceToken(token: string): DistanceParseResult {
  const match = token.toLowerCase().match(/^(\d+(?:[.,]\d+)?)km$/);
  if (!match || !match[1]) {
    return {
      ok: false,
      message: `Distance must use km format, e.g. 5km.`,
    };
  }

  const distanceKm = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return {
      ok: false,
      message: `Distance must be greater than 0.`,
    };
  }

  return { ok: true, distanceKm };
}

type WeightResult = { ok: true; value: number } | { ok: false; error: string };

function parseLiftPayload(tokens: string[]): ParseWorkoutPayloadResult {
  if (tokens.length < 5) {
    return { ok: false, message: workoutHelpMessage() };
  }

  const hasWeightToken = tokens.length >= 6 && /kg$/i.test(tokens[tokens.length - 1]);
  const repsTokenIndex = hasWeightToken ? tokens.length - 3 : tokens.length - 2;
  const setsTokenIndex = hasWeightToken ? tokens.length - 2 : tokens.length - 1;

  const reps = parsePositiveIntegerFromToken(tokens[repsTokenIndex], /^(\d+)rep(?:s)?$/i);
  if (reps === null) {
    return {
      ok: false,
      message: `Lift reps token is invalid. Use 20rep or 20reps.\n\n${workoutHelpMessage()}`,
    };
  }

  const sets = parsePositiveIntegerFromToken(tokens[setsTokenIndex], /^(\d+)set(?:s)?$/i);
  if (sets === null) {
    return {
      ok: false,
      message: `Lift sets token is invalid. Use 4set or 4sets.\n\n${workoutHelpMessage()}`,
    };
  }

  const activityTokens = tokens.slice(2, repsTokenIndex);
  const activity = activityTokens.join(' ').trim();
  if (!activity) {
    return { ok: false, message: `Lift activity is required.\n\n${workoutHelpMessage()}` };
  }

  let weight = 0;
  if (hasWeightToken) {
    const parsedWeight = parseWeightFromToken(tokens[tokens.length - 1]);
    if (!parsedWeight.ok) {
      return { ok: false, message: `${parsedWeight.error}\n\n${workoutHelpMessage()}` };
    }
    weight = parsedWeight.value;
  }

  return {
    ok: true,
    payload: {
      mode: 'lift',
      activity,
      reps,
      sets,
      weight,
    },
  };
}

function parseCardioPayload(tokens: string[]): ParseWorkoutPayloadResult {
  if (tokens.length < 4) {
    return { ok: false, message: workoutHelpMessage() };
  }

  const maybeDistanceToken = tokens[tokens.length - 1];
  const maybeDurationToken =
    tokens.length >= 5 && /km$/i.test(maybeDistanceToken)
      ? tokens[tokens.length - 2]
      : tokens[tokens.length - 1];

  const hasDistance = maybeDurationToken !== tokens[tokens.length - 1];
  const durationTokenIndex = hasDistance ? tokens.length - 2 : tokens.length - 1;

  const durationResult = parseDurationToken(tokens[durationTokenIndex]);
  if (!durationResult.ok) {
    return { ok: false, message: `${durationResult.message}\n\n${workoutHelpMessage()}` };
  }

  let distanceKm = 0;
  if (hasDistance) {
    const distanceResult = parseDistanceToken(tokens[tokens.length - 1]);
    if (!distanceResult.ok) {
      return { ok: false, message: `${distanceResult.message}\n\n${workoutHelpMessage()}` };
    }
    distanceKm = distanceResult.distanceKm;
  }

  const activityTokens = tokens.slice(2, durationTokenIndex);
  const activity = activityTokens.join(' ').trim();
  if (!activity) {
    return { ok: false, message: `Cardio activity is required.\n\n${workoutHelpMessage()}` };
  }

  return {
    ok: true,
    payload: {
      mode: 'cardio',
      activity,
      durationMinutes: durationResult.minutes,
      distanceKm,
    },
  };
}

function parseWorkoutPayload(invocation: CommandInvocation): ParseWorkoutPayloadResult {
  if (isLegacyMultiline(invocation.rawText)) {
    return {
      ok: false,
      message: `Workout format has been updated.\n\n${workoutHelpMessage()}`,
    };
  }

  const tokens = tokenize(invocation.firstLine);
  const mode = (tokens[1] || '').toLowerCase();

  if (mode === 'lift') {
    return parseLiftPayload(tokens);
  }

  if (mode === 'cardio') {
    return parseCardioPayload(tokens);
  }

  return {
    ok: false,
    message: `Please choose an explicit mode: lift or cardio.\n\n${workoutHelpMessage()}`,
  };
}

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

      if (r.workout_mode === 'cardio') {
        const durationStr = Number.isInteger(r.duration_minutes)
          ? `${r.duration_minutes}min`
          : `${r.duration_minutes.toFixed(1)}min`;
        const distanceStr = r.distance_km > 0 ? ` | ${r.distance_km}km` : '';
        return `• ${dateStr} – [cardio] ${r.type} | ${durationStr}${distanceStr}`;
      }

      const weightStr = r.weight === 0 ? 'bodyweight' : `${r.weight}kg`;
      return `• ${dateStr} – [lift] ${r.type} | ${r.reps} × ${r.sets} @ ${weightStr}`;
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

function toCardioLogResponse(
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

function parsePageNumber(firstLine: string): number {
  const tokens = tokenize(firstLine);
  const pageToken = tokens.find((t) => /^\d+$/.test(t));
  return pageToken ? Math.max(1, Number(pageToken)) : 1;
}

async function handleWorkoutList(
  ctx: Parameters<NamespaceHandler>[0],
  invocation: CommandInvocation,
  workoutRepository: WorkoutRepository
): Promise<string> {
  const now = ctx.now();
  const page = parsePageNumber(invocation.firstLine);
  const offset = (page - 1) * WORKOUT_LIST_LIMIT;

  const total = await workoutRepository.countByUser(ctx.sender);

  const totalPages = Math.max(1, Math.ceil(total / WORKOUT_LIST_LIMIT));

  if (total === 0) {
    return (
      `Nothing logged yet 👀\n\n` +
      `Start with:\n` +
      `#workout lift push up 20reps 4sets 10kg\n` +
      `or\n` +
      `#workout cardio run 30min 5km\n\n` +
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

  const rows = await workoutRepository.listByUser(ctx.sender, WORKOUT_LIST_LIMIT, offset);

  const list = formatWorkoutList(rows, ctx.timezoneOffsetMinutes, now);

  const days = await workoutRepository.getQualifyingStreakDays(
    ctx.sender,
    ctx.timezoneOffsetMinutes
  );
  const streaks = computeStreaks(days, ctx.timezoneOffsetMinutes, now);
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
  invocation: CommandInvocation,
  workoutRepository: WorkoutRepository
): Promise<string> {
  const parsed = parseWorkoutPayload(invocation);
  if (!parsed.ok) {
    return parsed.message;
  }

  const now = ctx.now();
  const payload = parsed.payload;

  if (payload.mode === 'lift') {
    await workoutRepository.insertWorkoutLog({
      user: ctx.sender,
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
  } else {
    await workoutRepository.insertWorkoutLog({
      user: ctx.sender,
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

  const logResponse =
    payload.mode === 'lift'
      ? toWorkoutLogResponse(
          payload.activity,
          payload.reps,
          payload.sets,
          payload.weight,
          ctx.timezoneOffsetMinutes,
          now
        )
      : toCardioLogResponse(
          payload.activity,
          payload.durationMinutes,
          payload.distanceKm,
          ctx.timezoneOffsetMinutes,
          now
        );

  const todayCount = await workoutRepository.getTodayCount(
    ctx.sender,
    ctx.timezoneOffsetMinutes,
    now.toISOString()
  );
  const remaining = MIN_WORKOUTS_FOR_STREAK - todayCount;

  let streakNote: string;
  if (remaining > 0) {
    streakNote = `\n\n${remaining} more to go today to keep the streak alive 🔥`;
  } else if (remaining === 0) {
    const days = await workoutRepository.getQualifyingStreakDays(
      ctx.sender,
      ctx.timezoneOffsetMinutes
    );
    const streaks = computeStreaks(days, ctx.timezoneOffsetMinutes, now);
    streakNote = `\n\n🔥 Day counted! Streak: ${streaks.current} day${streaks.current !== 1 ? 's' : ''}. Keep it rolling.`;
  } else {
    // Already qualified earlier, just acknowledge
    streakNote = `\n\n🔥 Already locked in today. Extra reps never hurt.`;
  }

  return logResponse + streakNote;
}

export function createWorkoutNamespaceHandler(
  workoutRepository: WorkoutRepository
): NamespaceHandler {
  return async (ctx, invocation) => {
    if (invocation.namespace !== WORKOUT_NAMESPACE) return null;

    const tokens = tokenize(invocation.firstLine);
    const actionToken = (tokens[1] || '').toLowerCase();

    if (invocation.subcommand === 'help' || actionToken === 'help') {
      return workoutHelpMessage();
    }

    if (invocation.subcommand === 'list' || actionToken === 'list') {
      return handleWorkoutList(ctx, invocation, workoutRepository);
    }

    return handleWorkoutLog(ctx, invocation, workoutRepository);
  };
}

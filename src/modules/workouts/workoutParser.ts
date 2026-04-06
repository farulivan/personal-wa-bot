import type { CommandInvocation } from '../../app/parseCommand.js';

export type LiftPayload = {
  mode: 'lift';
  activity: string;
  reps: number;
  sets: number;
  weight: number;
};

export type CardioPayload = {
  mode: 'cardio';
  activity: string;
  durationMinutes: number;
  distanceKm: number;
};

export type WorkoutPayload = LiftPayload | CardioPayload;

export type ParseWorkoutPayloadResult =
  | { ok: true; payload: WorkoutPayload }
  | { ok: false; message: string };

type DurationParseResult = { ok: true; minutes: number } | { ok: false; message: string };

type DistanceParseResult = { ok: true; distanceKm: number } | { ok: false; message: string };

type WeightResult = { ok: true; value: number } | { ok: false; error: string };

export function tokenize(firstLine: string): string[] {
  return firstLine.trim().split(/\s+/).filter(Boolean);
}

export function isLegacyMultiline(rawText: string): boolean {
  return /\n/.test(rawText) || /\btype\s*:|\breps\s*:|\bsets\s*:|\bweight\s*:/i.test(rawText);
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

export function workoutHelpMessage(): string {
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

export function parseLiftPayload(tokens: string[]): ParseWorkoutPayloadResult {
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

export function parseCardioPayload(tokens: string[]): ParseWorkoutPayloadResult {
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

export function parseWorkoutPayload(invocation: CommandInvocation): ParseWorkoutPayloadResult {
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

export function parsePageNumber(firstLine: string): number {
  const tokens = tokenize(firstLine);
  const pageToken = tokens.find((t) => /^\d+$/.test(t));
  return pageToken ? Math.max(1, Number(pageToken)) : 1;
}

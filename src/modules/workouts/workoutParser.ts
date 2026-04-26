import type { CommandInvocation } from '../../app/parseCommand.js';
import { ok, err } from '../../shared/result.js';
import type { Result } from '../../shared/result.js';
import { UNDO_WINDOW_MS } from './workoutService.js';
import { tokenize } from '../../shared/parsing.js';
export { tokenize, parsePageNumber } from '../../shared/parsing.js';

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

export type ParseWorkoutPayloadResult = Result<WorkoutPayload>;

type DurationParseResult = Result<{ minutes: number }>;

type DistanceParseResult = Result<{ distanceKm: number }>;

type WeightResult = Result<{ value: number }>;

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
    return err(`Weight token must use kg format, e.g. 10kg.`);
  }

  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) {
    return err(`Weight value is invalid. Use positive number with kg, e.g. 12kg.`);
  }

  return ok({ value });
}

function parseDurationToken(token: string): DurationParseResult {
  const match = token.toLowerCase().match(/^(\d+(?:[.,]\d+)?)(min|hour)$/);
  if (!match || !match[1] || !match[2]) {
    return err(`Duration must be attached token with min/hour, e.g. 30min or 1hour.`);
  }

  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) {
    return err(`Duration must be greater than 0.`);
  }

  const unit = match[2];
  const minutes = unit === 'hour' ? value * 60 : value;

  return ok({ minutes });
}

function parseDistanceToken(token: string): DistanceParseResult {
  const match = token.toLowerCase().match(/^(\d+(?:[.,]\d+)?)km$/);
  if (!match || !match[1]) {
    return err(`Distance must use km format, e.g. 5km.`);
  }

  const distanceKm = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return err(`Distance must be greater than 0.`);
  }

  return ok({ distanceKm });
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
    `• #workout list\n` +
    `• #workout list 2\n\n` +
    `• #workout undo\n` +
    `  Removes your last logged workout (within ${UNDO_WINDOW_MS / 60_000} minutes).\n\n` +
    `• #workout leaderboard\n` +
    `  Shows monthly workout ranking — sorted by number of sessions this month, with current streak displayed alongside.`
  );
}

export function parseLiftPayload(tokens: string[]): ParseWorkoutPayloadResult {
  if (tokens.length < 5) {
    return err(workoutHelpMessage());
  }

  const hasWeightToken = tokens.length >= 6 && /kg$/i.test(tokens[tokens.length - 1]);
  const repsTokenIndex = hasWeightToken ? tokens.length - 3 : tokens.length - 2;
  const setsTokenIndex = hasWeightToken ? tokens.length - 2 : tokens.length - 1;

  const reps = parsePositiveIntegerFromToken(tokens[repsTokenIndex], /^(\d+)rep(?:s)?$/i);
  if (reps === null) {
    return err(`Lift reps token is invalid. Use 20rep or 20reps.\n\n${workoutHelpMessage()}`);
  }

  const sets = parsePositiveIntegerFromToken(tokens[setsTokenIndex], /^(\d+)set(?:s)?$/i);
  if (sets === null) {
    return err(`Lift sets token is invalid. Use 4set or 4sets.\n\n${workoutHelpMessage()}`);
  }

  const activityTokens = tokens.slice(2, repsTokenIndex);
  const activity = activityTokens.join(' ').trim();
  if (!activity) {
    return err(`Lift activity is required.\n\n${workoutHelpMessage()}`);
  }

  let weight = 0;
  if (hasWeightToken) {
    const parsedWeight = parseWeightFromToken(tokens[tokens.length - 1]);
    if (!parsedWeight.ok) {
      return err(`${parsedWeight.error}\n\n${workoutHelpMessage()}`);
    }
    weight = parsedWeight.value.value;
  }

  return ok({
    mode: 'lift',
    activity,
    reps,
    sets,
    weight,
  });
}

export function parseCardioPayload(tokens: string[]): ParseWorkoutPayloadResult {
  if (tokens.length < 4) {
    return err(workoutHelpMessage());
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
    return err(`${durationResult.error}\n\n${workoutHelpMessage()}`);
  }

  let distanceKm = 0;
  if (hasDistance) {
    const distanceResult = parseDistanceToken(tokens[tokens.length - 1]);
    if (!distanceResult.ok) {
      return err(`${distanceResult.error}\n\n${workoutHelpMessage()}`);
    }
    distanceKm = distanceResult.value.distanceKm;
  }

  const activityTokens = tokens.slice(2, durationTokenIndex);
  const activity = activityTokens.join(' ').trim();
  if (!activity) {
    return err(`Cardio activity is required.\n\n${workoutHelpMessage()}`);
  }

  return ok({
    mode: 'cardio',
    activity,
    durationMinutes: durationResult.value.minutes,
    distanceKm,
  });
}

export function parseWorkoutPayload(invocation: CommandInvocation): ParseWorkoutPayloadResult {
  if (isLegacyMultiline(invocation.rawText)) {
    return err(`Workout format has been updated.\n\n${workoutHelpMessage()}`);
  }

  const tokens = tokenize(invocation.firstLine);
  const mode = (tokens[1] || '').toLowerCase();

  if (mode === 'lift') {
    return parseLiftPayload(tokens);
  }

  if (mode === 'cardio') {
    return parseCardioPayload(tokens);
  }

  return err(`Please choose an explicit mode: lift or cardio.\n\n${workoutHelpMessage()}`);
}

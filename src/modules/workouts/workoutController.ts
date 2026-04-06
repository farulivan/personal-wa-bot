import type { NamespaceHandler, CommandContext } from '../../app/commandRouter.js';
import type { CommandInvocation } from '../../app/parseCommand.js';
import { debug } from '../../logger.js';
import { MIN_WORKOUTS_FOR_STREAK } from '../../config/env.js';
import {
  parseWorkoutPayload,
  parsePageNumber,
  tokenize,
  workoutHelpMessage,
} from './workoutParser.js';
import {
  formatLiftLogResponse,
  formatCardioLogResponse,
  formatStreakNote,
  formatWorkoutList,
  formatStreakSection,
  formatListPageFooter,
  formatEmptyListMessage,
  formatPageOverflowMessage,
} from './workoutPresenter.js';
import type { WorkoutService } from './workoutService.js';

const WORKOUT_NAMESPACE = 'workout';

export function createWorkoutController(workoutService: WorkoutService): NamespaceHandler {
  async function handleList(ctx: CommandContext, invocation: CommandInvocation): Promise<string> {
    const now = ctx.now();
    const page = parsePageNumber(invocation.firstLine);

    const result = await workoutService.listWorkouts(
      ctx.sender,
      page,
      ctx.timezoneOffsetMinutes,
      now
    );

    if (result.total === 0) {
      return formatEmptyListMessage();
    }

    if (page > result.totalPages) {
      return formatPageOverflowMessage(page, result.totalPages);
    }

    const list = formatWorkoutList(result.rows, ctx.timezoneOffsetMinutes, now);
    const streakSection = formatStreakSection(result.streaks);
    const pageFooter = formatListPageFooter(result.page, result.totalPages);

    debug(`📋 Listed ${result.rows.length} workouts (page ${result.page}/${result.totalPages})`);
    return `Recent work 💪\n\n${list}${streakSection}${pageFooter}`;
  }

  async function handleLog(ctx: CommandContext, invocation: CommandInvocation): Promise<string> {
    const parsed = parseWorkoutPayload(invocation);
    if (!parsed.ok) {
      return parsed.message;
    }

    const now = ctx.now();
    const payload = parsed.payload;

    if (payload.mode === 'lift') {
      await workoutService.logLift(ctx.sender, payload, now);
    } else {
      await workoutService.logCardio(ctx.sender, payload, now);
    }

    const logResponse =
      payload.mode === 'lift'
        ? formatLiftLogResponse(
            payload.activity,
            payload.reps,
            payload.sets,
            payload.weight,
            ctx.timezoneOffsetMinutes,
            now
          )
        : formatCardioLogResponse(
            payload.activity,
            payload.durationMinutes,
            payload.distanceKm,
            ctx.timezoneOffsetMinutes,
            now
          );

    const streakResult = await workoutService.getStreakAfterLog(
      ctx.sender,
      ctx.timezoneOffsetMinutes,
      now
    );

    const streakNote = formatStreakNote(
      streakResult.todayCount,
      MIN_WORKOUTS_FOR_STREAK,
      streakResult.streaks
    );

    return logResponse + streakNote;
  }

  return async (ctx, invocation) => {
    if (invocation.namespace !== WORKOUT_NAMESPACE) return null;

    const tokens = tokenize(invocation.firstLine);
    const actionToken = (tokens[1] || '').toLowerCase();

    if (invocation.subcommand === 'help' || actionToken === 'help') {
      return workoutHelpMessage();
    }

    if (invocation.subcommand === 'list' || actionToken === 'list') {
      return handleList(ctx, invocation);
    }

    return handleLog(ctx, invocation);
  };
}

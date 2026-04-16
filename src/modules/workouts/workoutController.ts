import type { NamespaceHandler, CommandContext } from '../../app/commandRouter.js';
import type { CommandInvocation } from '../../app/parseCommand.js';
import { debug } from '../../logger.js';
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
  formatUndoSuccess,
  formatUndoNoLogs,
  formatUndoTooLate,
} from './workoutPresenter.js';
import type { WorkoutService } from './workoutService.js';

const WORKOUT_NAMESPACE = 'workout';

export function createWorkoutController(workoutService: WorkoutService): NamespaceHandler {
  async function handleList(ctx: CommandContext, invocation: CommandInvocation): Promise<string> {
    const now = ctx.time.now();
    const page = parsePageNumber(invocation.firstLine);

    const result = await workoutService.listWorkouts(
      ctx.sender,
      page,
      ctx.time.timezoneOffsetMinutes,
      now
    );

    if (result.total === 0) {
      return formatEmptyListMessage();
    }

    if (page > result.totalPages) {
      return formatPageOverflowMessage(page, result.totalPages);
    }

    const list = formatWorkoutList(result.rows, ctx.time.timezoneOffsetMinutes, now);
    const streakSection = formatStreakSection(result.streaks);
    const pageFooter = formatListPageFooter(result.page, result.totalPages);

    debug(`📋 Listed ${result.rows.length} workouts (page ${result.page}/${result.totalPages})`);
    return `Recent work 💪\n\n${list}${streakSection}${pageFooter}`;
  }

  async function handleUndo(ctx: CommandContext): Promise<string> {
    const result = await workoutService.undoLastLog(ctx.sender, ctx.time.now());
    if (!result.undone) {
      if (result.reason === 'too_late') {
        return formatUndoTooLate(result.entry);
      }
      return formatUndoNoLogs();
    }
    return formatUndoSuccess(result.entry);
  }

  async function handleLog(ctx: CommandContext, invocation: CommandInvocation): Promise<string> {
    const parsed = parseWorkoutPayload(invocation);
    if (!parsed.ok) {
      return parsed.error;
    }

    const now = ctx.time.now();
    const payload = parsed.value;

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
            ctx.time.timezoneOffsetMinutes,
            now
          )
        : formatCardioLogResponse(
            payload.activity,
            payload.durationMinutes,
            payload.distanceKm,
            ctx.time.timezoneOffsetMinutes,
            now
          );

    const streakResult = await workoutService.getStreakAfterLog(
      ctx.sender,
      ctx.time.timezoneOffsetMinutes,
      now
    );

    const streakNote = formatStreakNote(
      streakResult.todayCount,
      workoutService.minWorkoutsForStreak,
      streakResult.streaks
    );

    return logResponse + streakNote;
  }

  return async (ctx, invocation) => {
    if (invocation.namespace !== WORKOUT_NAMESPACE) return null;

    const tokens = tokenize(invocation.firstLine);
    const actionToken = (tokens[1] || '').toLowerCase();

    if (actionToken === 'help' || invocation.firstLine.toLowerCase().includes('--help')) {
      return workoutHelpMessage();
    }

    if (actionToken === 'list') {
      return handleList(ctx, invocation);
    }

    if (actionToken === 'undo') {
      return handleUndo(ctx);
    }

    return handleLog(ctx, invocation);
  };
}

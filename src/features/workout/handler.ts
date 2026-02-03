import { BaseFeature } from '../base.js';
import type { MessageContext, CommandResult } from '../../types/types.js';
import { parseKeyValue } from '../../utils/parser.js';
import { formatRelativeDate } from '../../utils/date.js';
import { formatWeight, getTimeBasedResponse } from '../../utils/response.js';
import { saveWorkout, getRecentWorkouts } from './repository.js';

export class WorkoutFeature extends BaseFeature {
  name = 'workout';
  commands = ['workout', 'list'];

  async handle(ctx: MessageContext): Promise<CommandResult> {
    const command = ctx.text.slice(1).split('\n')[0].trim();

    if (command === 'list') {
      return this.handleList(ctx);
    }

    if (command === 'workout' || command.startsWith('workout')) {
      return this.handleWorkout(ctx);
    }

    return { handled: false };
  }

  private async handleList(ctx: MessageContext): Promise<CommandResult> {
    const rows = getRecentWorkouts(ctx.sender);

    if (rows.length === 0) {
      return {
        handled: true,
        response:
          `Nothing logged yet 👀\n\n` +
          `Start with:\n` +
          `#workout\n\n` +
          `Let's get the first one in 💪`,
      };
    }

    const list = rows
      .map((r) => {
        const dateStr = formatRelativeDate(r.created_at);
        const weightStr = formatWeight(r.weight);
        return `• ${dateStr} – ${r.type} | ${r.reps} × ${r.sets} @ ${weightStr}`;
      })
      .join('\n');

    console.log(`📋 Listed ${rows.length} workouts`);
    return {
      handled: true,
      response: `Recent work 💪\n\n${list}`,
    };
  }

  private async handleWorkout(ctx: MessageContext): Promise<CommandResult> {
    const data = parseKeyValue(ctx.text);

    if (!data.type || !data.reps || !data.sets) {
      return {
        handled: true,
        response:
          'Hmm 🤔 that didn\'t go through.\n\n' +
          'Use this format:\n' +
          '#workout\n' +
          'type: push up\n' +
          'reps: 20\n' +
          'sets: 4\n' +
          'weight: 10 (optional)\n\n' +
          `(weight is in kg, leave it blank for bodyweight)\n\n` +
          `Try again 💪`,
      };
    }

    const now = new Date();
    const weight = data.weight ? Number(data.weight) : 0;
    const weightLabel = formatWeight(weight);

    saveWorkout({
      user: ctx.sender,
      type: data.type,
      reps: Number(data.reps),
      sets: Number(data.sets),
      weight,
      created_at: now.toISOString(),
    });

    const timeResponse = getTimeBasedResponse();

    console.log(`💾 Workout saved: ${data.type} ${data.reps}×${data.sets} @ ${weightLabel}`);
    return {
      handled: true,
      response: `Logged 💪\n${data.type}\n${data.reps} × ${data.sets} @ ${weightLabel}\n\n${timeResponse}`,
    };
  }

  getHelp(): string {
    return (
      `• #workout - log a workout\n` +
      `• #list - see your recent workouts`
    );
  }
}

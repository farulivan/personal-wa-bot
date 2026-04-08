import type { NamespaceHandler, CommandContext } from '../../app/commandRouter.js';
import type { CommandInvocation } from '../../app/parseCommand.js';
import {
  parseReminderCommand,
  parsePageNumber,
  tokenize,
  resolveDateInput,
} from './remindParser.js';
import type { ParsedReminderCommand } from './remindParser.js';
import {
  formatHelpMessage,
  formatReminderCreated,
  formatReminderList,
  formatEmptyListMessage,
  formatListPageOverflowMessage,
  formatPastTimeMessage,
  formatActiveLimitMessage,
} from './remindPresenter.js';
import type { RemindService } from './remindService.js';

const REMIND_NAMESPACE = 'remind';

export function createRemindController(remindService: RemindService): NamespaceHandler {
  async function handleCreate(ctx: CommandContext, parsed: ParsedReminderCommand): Promise<string> {
    const now = ctx.now();
    const result = await remindService.createReminder(
      ctx.sender,
      ctx.replyChatId,
      ctx.isGroupChat,
      parsed,
      ctx.timezoneOffsetMinutes,
      now
    );

    if (!result.ok) {
      if (result.error.reason === 'active_limit') {
        return formatActiveLimitMessage(result.error.activeCount ?? 0);
      }
      return formatPastTimeMessage();
    }

    return formatReminderCreated(
      result.value.scheduledAt,
      ctx.timezoneOffsetMinutes,
      result.value.reminderText,
      ctx.isGroupChat
    );
  }

  async function handleList(ctx: CommandContext, invocation: CommandInvocation): Promise<string> {
    const now = ctx.now();
    const page = parsePageNumber(invocation.firstLine);
    const result = await remindService.listReminders(ctx.sender, page);

    if (result.total === 0) {
      return formatEmptyListMessage();
    }

    if (page > result.totalPages) {
      return formatListPageOverflowMessage(page, result.totalPages);
    }

    return formatReminderList(
      result.rows,
      result.page,
      result.totalPages,
      ctx.timezoneOffsetMinutes,
      now
    );
  }

  return async (ctx, invocation) => {
    if (invocation.namespace !== REMIND_NAMESPACE) return null;

    const tokens = tokenize(invocation.firstLine);
    const actionToken = (tokens[1] || '').toLowerCase();

    const isHelp =
      invocation.subcommand === 'help' ||
      invocation.firstLine.toLowerCase().includes('--help') ||
      actionToken === 'help' ||
      tokens.length === 1;

    if (isHelp) {
      return formatHelpMessage();
    }

    const isList = invocation.subcommand === 'list' || actionToken === 'list';
    if (isList) {
      return handleList(ctx, invocation);
    }

    const parsed = parseReminderCommand(invocation.firstLine);
    if (!parsed.ok) {
      return parsed.error;
    }

    // Validate date before passing to service (to surface user-facing error messages)
    const now = ctx.now();
    const dateResult = resolveDateInput(parsed.value.dateInput, now, ctx.timezoneOffsetMinutes);
    if (!dateResult.ok) {
      return dateResult.error;
    }

    return handleCreate(ctx, parsed.value);
  };
}

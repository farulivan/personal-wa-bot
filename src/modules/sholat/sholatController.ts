import type { NamespaceHandler } from '../../app/commandRouter.js';
import { error } from '../../logger.js';
import { hasFlag, extractFlagValue } from './sholatParser.js';
import {
  formatScheduleResponse,
  formatHelpMessage,
  formatAmbiguousLocationMessage,
  formatLocationNotFoundMessage,
  formatPersistErrorMessage,
  formatFetchErrorMessage,
  formatReminderEnabled,
  formatReminderDisabled,
  formatReminderStatus,
  formatReminderGroupNotAllowed,
} from './sholatPresenter.js';
import type { SholatService, SholatError } from './sholatService.js';

const SHOLAT_NAMESPACE = 'sholat';

function formatSholatError(e: SholatError, defaultLocation: string): string {
  if (e.type === 'ambiguous') return formatAmbiguousLocationMessage(e.input, e.samples);
  if (e.type === 'notfound') return formatLocationNotFoundMessage(e.input || defaultLocation);
  return formatPersistErrorMessage(e.locationName);
}

export function createSholatController(
  sholatService: SholatService,
  defaultLocation: string
): NamespaceHandler {
  return async (ctx, invocation) => {
    if (invocation.namespace !== SHOLAT_NAMESPACE) return null;

    const tokens = invocation.firstLine.trim().split(/\s+/).filter(Boolean);
    const actionToken = (tokens[1] || '').toLowerCase();

    if (actionToken === 'reminder') {
      const value = (tokens[2] || '').toLowerCase();
      if (value === 'on' || value === 'off') {
        const outcome = await sholatService.setReminder({
          chatId: ctx.replyChatId,
          isGroupChat: ctx.isGroupChat,
          enabled: value === 'on',
          now: ctx.time.now(),
        });
        if (outcome === 'group_not_allowed') return formatReminderGroupNotAllowed();
        return outcome === 'enabled' ? formatReminderEnabled() : formatReminderDisabled();
      }
      const enabled = await sholatService.getReminderStatus(ctx.replyChatId);
      return formatReminderStatus(enabled);
    }

    const isHelp = actionToken === 'help' || hasFlag(invocation.firstLine, 'help');
    if (isHelp) {
      return formatHelpMessage(defaultLocation);
    }

    const isToday =
      tokens.length === 1 ||
      hasFlag(invocation.firstLine, 'today') ||
      hasFlag(invocation.firstLine, 'location');

    if (!isToday) {
      return formatHelpMessage(defaultLocation);
    }

    const locationArg = extractFlagValue(invocation.firstLine, 'location');
    const now = ctx.time.now();

    try {
      const result = await sholatService.getTodaySchedule(locationArg, now);

      if (!result.ok) {
        return formatSholatError(result.error, defaultLocation);
      }

      return formatScheduleResponse(result.value.locationName, result.value.schedule);
    } catch (err) {
      error({ err }, '🕌 Failed handling #sholat command');
      return formatFetchErrorMessage();
    }
  };
}

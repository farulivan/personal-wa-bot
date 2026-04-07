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
} from './sholatPresenter.js';
import type { SholatService } from './sholatService.js';

const SHOLAT_NAMESPACE = 'sholat';

function decodeServiceMessage(message: string, defaultLocation: string): string {
  if (message.startsWith('__ambiguous__:')) {
    const parts = message.slice('__ambiguous__:'.length).split(':');
    const locationInput = parts[0] ?? '';
    const samples = (parts[1] ?? '').split('|').filter(Boolean);
    return formatAmbiguousLocationMessage(locationInput, samples);
  }

  if (message.startsWith('__notfound__:')) {
    const locationInput = message.slice('__notfound__:'.length);
    return formatLocationNotFoundMessage(locationInput || defaultLocation);
  }

  if (message.startsWith('__persist_error__:')) {
    const locationName = message.slice('__persist_error__:'.length);
    return formatPersistErrorMessage(locationName);
  }

  return message;
}

export function createSholatController(
  sholatService: SholatService,
  defaultLocation: string
): NamespaceHandler {
  return async (ctx, invocation) => {
    if (invocation.namespace !== SHOLAT_NAMESPACE) return null;

    const isHelp = invocation.subcommand === 'help' || hasFlag(invocation.firstLine, 'help');
    if (isHelp) {
      return formatHelpMessage(defaultLocation);
    }

    const isToday =
      invocation.subcommand === 'today' ||
      invocation.subcommand === 'log' ||
      invocation.subcommand === 'location' ||
      hasFlag(invocation.firstLine, 'today') ||
      hasFlag(invocation.firstLine, 'location');

    if (!isToday) {
      return formatHelpMessage(defaultLocation);
    }

    const locationArg = extractFlagValue(invocation.firstLine, 'location');
    const now = ctx.now();

    try {
      const result = await sholatService.getTodaySchedule(locationArg, now);

      if (!result.ok) {
        return decodeServiceMessage(result.error, defaultLocation);
      }

      return formatScheduleResponse(result.value.locationName, result.value.schedule);
    } catch (err) {
      error('🕌 Failed handling #sholat command:', err);
      return formatFetchErrorMessage();
    }
  };
}

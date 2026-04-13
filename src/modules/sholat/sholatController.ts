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
    const now = ctx.time.now();

    try {
      const result = await sholatService.getTodaySchedule(locationArg, now);

      if (!result.ok) {
        return formatSholatError(result.error, defaultLocation);
      }

      return formatScheduleResponse(result.value.locationName, result.value.schedule);
    } catch (err) {
      error('🕌 Failed handling #sholat command:', err);
      return formatFetchErrorMessage();
    }
  };
}

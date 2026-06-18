import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { ScheduledJob } from '../../app/scheduler.js';
import { withErrorBoundary } from '../../app/withErrorBoundary.js';
import { createSholatController } from './sholatController.js';
import { SholatService } from './sholatService.js';
import { prefetchTodaySchedule } from './sholatPrefetchJob.js';
import type { SholatRepository } from './infra/sholatRepository.js';
import type { MyQuranSholatClient } from './infra/myQuranSholatClient.js';

// When the daily schedule cache is warmed (user-local time). Kept just after midnight so
// today's schedule is ready well before Subuh, with time to surface upstream errors.
const SHOLAT_PREFETCH_HOUR = 0;
const SHOLAT_PREFETCH_MINUTE = 5;

export type SholatModuleDeps = {
  sholatRepository: SholatRepository;
  sholatClient: MyQuranSholatClient;
  defaultLocation: string;
  defaultTimezone: string;
  digestGroupId: string;
  timezoneOffsetMinutes: number;
};

export type SholatModuleRegistration = {
  controller: NamespaceHandler;
  jobs: ScheduledJob[];
};

export function registerSholatModule(deps: SholatModuleDeps): SholatModuleRegistration {
  const sholatService = new SholatService(
    deps.sholatRepository,
    deps.sholatClient,
    deps.defaultLocation,
    deps.defaultTimezone,
    deps.digestGroupId
  );

  const controller = withErrorBoundary(
    'sholat',
    createSholatController(sholatService, deps.defaultLocation)
  );

  const jobs: ScheduledJob[] = [
    {
      name: 'Sholat daily prefetch',
      hour: SHOLAT_PREFETCH_HOUR,
      minute: SHOLAT_PREFETCH_MINUTE,
      timezoneOffsetMinutes: deps.timezoneOffsetMinutes,
      run: () => prefetchTodaySchedule({ sholatService, now: () => new Date() }),
    },
  ];

  return { controller, jobs };
}

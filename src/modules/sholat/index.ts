import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { ScheduledJob } from '../../app/scheduler.js';
import { withErrorBoundary } from '../../app/withErrorBoundary.js';
import { createSholatController } from './sholatController.js';
import { SholatService } from './sholatService.js';
import { prefetchTodaySchedule } from './sholatPrefetchJob.js';
import {
  startSholatReminderScheduler,
  type SholatReminderSchedulerHandle,
} from './sholatReminderScheduler.js';
import type { SholatRepository } from './infra/sholatRepository.js';
import type { MyQuranSholatClient } from './infra/myQuranSholatClient.js';
import type { MessageSenderPort } from '../../adapters/whatsapp/ports.js';

export type SholatModuleDeps = {
  sholatRepository: SholatRepository;
  sholatClient: MyQuranSholatClient;
  defaultLocation: string;
  defaultTimezone: string;
  digestGroupIds: string[];
  timezoneOffsetMinutes: number;
  senderPort: MessageSenderPort;
  isConnected?: () => boolean;
};

export type SholatModuleRegistration = {
  controller: NamespaceHandler;
  jobs: ScheduledJob[];
  startScheduler: () => SholatReminderSchedulerHandle;
};

export function registerSholatModule(deps: SholatModuleDeps): SholatModuleRegistration {
  const sholatService = new SholatService(
    deps.sholatRepository,
    deps.sholatClient,
    deps.defaultLocation,
    deps.defaultTimezone,
    deps.digestGroupIds
  );

  const controller = withErrorBoundary(
    'sholat',
    createSholatController(sholatService, deps.defaultLocation)
  );

  // No scheduled prefetch job: the ticker warms the cache on a miss (cache-aside), which also
  // covers a mid-day restart that a fixed-time job would miss. See ADR 0004.
  const jobs: ScheduledJob[] = [];

  const startScheduler = (): SholatReminderSchedulerHandle =>
    startSholatReminderScheduler({
      sholatService,
      sholatRepository: deps.sholatRepository,
      senderPort: deps.senderPort,
      timezoneOffsetMinutes: deps.timezoneOffsetMinutes,
      warmCache: () => prefetchTodaySchedule({ sholatService, now: () => new Date() }),
      isConnected: deps.isConnected,
    });

  return { controller, jobs, startScheduler };
}

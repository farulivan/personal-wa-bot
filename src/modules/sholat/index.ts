import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { ScheduledJob } from '../../app/scheduler.js';
import { withErrorBoundary } from '../../app/withErrorBoundary.js';
import { createSholatController } from './sholatController.js';
import { SholatService } from './sholatService.js';
import type { SholatRepository } from './infra/sholatRepository.js';
import type { MyQuranSholatClient } from './infra/myQuranSholatClient.js';

export type SholatModuleDeps = {
  sholatRepository: SholatRepository;
  sholatClient: MyQuranSholatClient;
  defaultLocation: string;
  defaultTimezone: string;
  digestGroupId: string;
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

  return { controller, jobs: [] };
}

import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { ScheduledJob } from '../../app/scheduler.js';
import { withErrorBoundary } from '../../app/withErrorBoundary.js';
import { createRemindController } from './remindController.js';
import { RemindService } from './remindService.js';
import { startReminderScheduler } from './remindScheduler.js';
import type { RemindRepository } from './infra/remindRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import type { WhatsAppSenderLike } from '../../adapters/whatsapp/types.js';

export type RemindModuleDeps = {
  remindRepository: RemindRepository;
  userRepository: UserRepository;
  client: WhatsAppSenderLike;
  timezoneOffsetMinutes: number;
  remindListLimit: number;
};

export type RemindModuleRegistration = {
  controller: NamespaceHandler;
  jobs: ScheduledJob[];
  startScheduler: () => void;
};

export function registerRemindModule(deps: RemindModuleDeps): RemindModuleRegistration {
  const remindService = new RemindService(deps.remindRepository, deps.remindListLimit);

  const controller = withErrorBoundary('remind', createRemindController(remindService));

  const startScheduler = () => {
    startReminderScheduler({
      client: deps.client,
      remindRepository: deps.remindRepository,
      userRepository: deps.userRepository,
      timezoneOffsetMinutes: deps.timezoneOffsetMinutes,
    });
  };

  return { controller, jobs: [], startScheduler };
}

import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { ScheduledJob } from '../../app/scheduler.js';
import { withErrorBoundary } from '../../app/withErrorBoundary.js';
import { createWorkoutController } from './workoutController.js';
import { WorkoutService } from './workoutService.js';
import { createDailyStreakDigestSender } from './workoutDigest.js';
import type { WorkoutRepository } from './infra/workoutRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';

type WhatsAppClientLike = {
  sendMessage: (chatId: string, text: string) => Promise<unknown>;
  getChatById: (chatId: string) => Promise<unknown>;
  getContactById: (contactId: string) => Promise<unknown>;
  info: { wid: { _serialized: string; user: string } };
};

export type WorkoutModuleDeps = {
  workoutRepository: WorkoutRepository;
  userRepository: UserRepository;
  client: WhatsAppClientLike;
  timezoneOffsetMinutes: number;
  digestGroupId: string | undefined;
  dailyDigestHour: number;
  dailyDigestMinute: number;
};

export type WorkoutModuleRegistration = {
  controller: NamespaceHandler;
  jobs: ScheduledJob[];
};

export function registerWorkoutModule(deps: WorkoutModuleDeps): WorkoutModuleRegistration {
  const workoutService = new WorkoutService(deps.workoutRepository, deps.userRepository);

  const controller = withErrorBoundary('workout', createWorkoutController(workoutService));

  const jobs: ScheduledJob[] = [];

  if (deps.digestGroupId) {
    const sendDailyStreakDigest = createDailyStreakDigestSender({
      client: deps.client,
      workoutService,
      timezoneOffsetMinutes: deps.timezoneOffsetMinutes,
    });

    jobs.push({
      name: 'Daily Streak Standings',
      hour: deps.dailyDigestHour,
      minute: deps.dailyDigestMinute,
      timezoneOffsetMinutes: deps.timezoneOffsetMinutes,
      run: () => sendDailyStreakDigest(deps.digestGroupId!),
    });
  }

  return { controller, jobs };
}

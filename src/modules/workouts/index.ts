import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { ScheduledJob } from '../../app/scheduler.js';
import { withErrorBoundary } from '../../app/withErrorBoundary.js';
import { createWorkoutController } from './workoutController.js';
import { WorkoutService } from './workoutService.js';
import {
  createDailyStreakDigestSender,
  createMonthlyWorkoutDigestSender,
} from './workoutDigest.js';
import type { WorkoutRepository } from './infra/workoutRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import type { GroupMembershipPort, MessageSenderPort } from '../../adapters/whatsapp/ports.js';

export type WorkoutModuleDeps = {
  workoutRepository: WorkoutRepository;
  userRepository: UserRepository;
  senderPort: MessageSenderPort;
  membershipPort: GroupMembershipPort;
  timezoneOffsetMinutes: number;
  digestGroupIds: string[];
  dailyDigestHour: number;
  dailyDigestMinute: number;
  monthlyDigestHour: number;
  monthlyDigestMinute: number;
  minWorkoutsForStreak: number;
  workoutListLimit: number;
};

export type WorkoutModuleRegistration = {
  controller: NamespaceHandler;
  jobs: ScheduledJob[];
};

export function registerWorkoutModule(deps: WorkoutModuleDeps): WorkoutModuleRegistration {
  const workoutService = new WorkoutService(
    deps.workoutRepository,
    deps.userRepository,
    deps.minWorkoutsForStreak,
    deps.workoutListLimit
  );

  const controller = withErrorBoundary(
    'workout',
    createWorkoutController(workoutService, deps.membershipPort)
  );

  // A digest that fails on its minute — a database blip, a dropped socket — is worth retrying
  // for a while, but not all day: past this it is stale enough to be noise.
  const CATCH_UP_MINUTES = 30;

  const jobs: ScheduledJob[] = [];

  if (deps.digestGroupIds.length > 0) {
    const digestDeps = {
      senderPort: deps.senderPort,
      membershipPort: deps.membershipPort,
      workoutService,
      timezoneOffsetMinutes: deps.timezoneOffsetMinutes,
    };

    const sendDailyStreakDigest = createDailyStreakDigestSender(digestDeps);
    const sendMonthlyWorkoutDigest = createMonthlyWorkoutDigestSender(digestDeps);

    for (const groupId of deps.digestGroupIds) {
      jobs.push({
        name: `Daily Workout Leaderboard · ${groupId}`,
        hour: deps.dailyDigestHour,
        minute: deps.dailyDigestMinute,
        timezoneOffsetMinutes: deps.timezoneOffsetMinutes,
        catchUpMinutes: CATCH_UP_MINUTES,
        run: () => sendDailyStreakDigest(groupId),
      });

      jobs.push({
        name: `Monthly Workout Recap · ${groupId}`,
        hour: deps.monthlyDigestHour,
        minute: deps.monthlyDigestMinute,
        timezoneOffsetMinutes: deps.timezoneOffsetMinutes,
        catchUpMinutes: CATCH_UP_MINUTES,
        dayOfMonth: 1,
        run: () => sendMonthlyWorkoutDigest(groupId),
      });
    }
  }

  return { controller, jobs };
}

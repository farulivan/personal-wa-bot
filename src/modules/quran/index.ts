import type { NamespaceHandler } from '../../app/commandRouter.js';
import type { ScheduledJob } from '../../app/scheduler.js';
import { withErrorBoundary } from '../../app/withErrorBoundary.js';
import { createQuranController } from './quranController.js';
import { QuranService } from './quranService.js';
import { createQuranReminderSender, createMonthlyQuranDigestSender } from './quranDigest.js';
import type { QuranRepository } from './infra/quranRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import type { GroupMembershipPort, MessageSenderPort } from '../../adapters/whatsapp/ports.js';

export type QuranModuleDeps = {
  quranRepository: QuranRepository;
  userRepository: UserRepository;
  membershipPort: GroupMembershipPort;
  senderPort: MessageSenderPort;
  timezoneOffsetMinutes: number;
  digestGroupIds: string[];
  quranReminderHour: number;
  quranReminderMinute: number;
  monthlyDigestHour: number;
  monthlyDigestMinute: number;
  quranListLimit: number;
  ramadhanCountEnabled: boolean;
  ramadhanStartDate: string;
  ramadhanEndDate: string;
};

export type QuranModuleRegistration = {
  controller: NamespaceHandler;
  jobs: ScheduledJob[];
};

export function registerQuranModule(deps: QuranModuleDeps): QuranModuleRegistration {
  const quranService = new QuranService(
    deps.quranRepository,
    deps.userRepository,
    deps.quranListLimit,
    deps.ramadhanCountEnabled,
    deps.ramadhanStartDate,
    deps.ramadhanEndDate
  );

  const controller = withErrorBoundary('quran', createQuranController(quranService));

  const jobs: ScheduledJob[] = [];

  if (deps.digestGroupIds.length > 0) {
    const sendNightlyQuranReminder = createQuranReminderSender({
      membershipPort: deps.membershipPort,
      senderPort: deps.senderPort,
      quranService,
      timezoneOffsetMinutes: deps.timezoneOffsetMinutes,
    });

    const sendMonthlyQuranDigest = createMonthlyQuranDigestSender({
      senderPort: deps.senderPort,
      quranService,
      timezoneOffsetMinutes: deps.timezoneOffsetMinutes,
    });

    for (const groupId of deps.digestGroupIds) {
      jobs.push({
        name: `Quran Night Reminder · ${groupId}`,
        hour: deps.quranReminderHour,
        minute: deps.quranReminderMinute,
        timezoneOffsetMinutes: deps.timezoneOffsetMinutes,
        run: () => sendNightlyQuranReminder(groupId),
      });

      jobs.push({
        name: `Monthly Quran Recap · ${groupId}`,
        hour: deps.monthlyDigestHour,
        minute: deps.monthlyDigestMinute,
        timezoneOffsetMinutes: deps.timezoneOffsetMinutes,
        dayOfMonth: 1,
        run: () => sendMonthlyQuranDigest(groupId),
      });
    }
  }

  return { controller, jobs };
}

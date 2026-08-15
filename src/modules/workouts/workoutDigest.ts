import { toPhoneNumber } from '../../shared/identity.js';
import { debug, error } from '../../logger.js';
import {
  formatDigestMessage,
  formatMonthlyDigestMessage,
  rankLeaderboardEntries,
} from './workoutPresenter.js';
import type { WorkoutService, WorkoutLeaderboardEntry } from './workoutService.js';
import type { GroupMembershipPort, MessageSenderPort } from '../../adapters/whatsapp/ports.js';
import { resolveMentionablePhoneNumbers } from '../../adapters/whatsapp/resolveMentionablePhoneNumbers.js';

type DigestDeps = {
  senderPort: MessageSenderPort;
  membershipPort: GroupMembershipPort;
  workoutService: WorkoutService;
  timezoneOffsetMinutes: number;
};

export function createDailyStreakDigestSender(deps: DigestDeps) {
  return async function sendDailyStreakDigest(groupChatId: string): Promise<void> {
    const now = new Date();

    let ranked: WorkoutLeaderboardEntry[];
    try {
      const { entries } = await deps.workoutService.getLeaderboard(deps.timezoneOffsetMinutes, now);
      ranked = rankLeaderboardEntries(entries);
    } catch (err) {
      error({ err, groupChatId }, '⏰ Failed to load leaderboard for digest');
      return;
    }

    if (ranked.length === 0) {
      debug('⏰ Digest: no leaderboard entries, skipping');
      return;
    }

    const mentionablePhoneNumbers = await resolveMentionablePhoneNumbers(
      deps.membershipPort,
      groupChatId,
      ranked.map((e) => (e.phoneNumber === null ? null : toPhoneNumber(e.phoneNumber)))
    );

    const result = formatDigestMessage(ranked, mentionablePhoneNumbers);
    try {
      await deps.senderPort.sendMessage(groupChatId, result.text, result.mentions);
      debug(`⏰ Digest sent to ${groupChatId}`);
    } catch (err) {
      error({ err, groupChatId }, '⏰ Failed to send digest');
    }
  };
}

export function createMonthlyWorkoutDigestSender(deps: DigestDeps) {
  return async function sendMonthlyWorkoutDigest(groupChatId: string): Promise<void> {
    const now = new Date();

    let ranked: WorkoutLeaderboardEntry[];
    let monthLabel: string;
    try {
      const result = await deps.workoutService.getLastMonthLeaderboard(
        deps.timezoneOffsetMinutes,
        now
      );
      ranked = rankLeaderboardEntries(result.entries);
      monthLabel = result.monthLabel;
    } catch (err) {
      error({ err, groupChatId }, '📅 Failed to load monthly workout leaderboard');
      return;
    }

    const message = formatMonthlyDigestMessage(ranked, monthLabel);

    try {
      await deps.senderPort.sendMessage(groupChatId, message);
      debug(`📅 Monthly workout digest sent to ${groupChatId}`);
    } catch (err) {
      error({ err, groupChatId }, '📅 Failed to send monthly workout digest');
    }
  };
}

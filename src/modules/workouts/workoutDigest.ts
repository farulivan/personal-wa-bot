import { debug, error } from '../../logger.js';
import { formatDigestMessage, rankLeaderboardEntries } from './workoutPresenter.js';
import type { WorkoutService, WorkoutLeaderboardEntry } from './workoutService.js';
import type { MessageSenderPort } from '../../adapters/whatsapp/ports.js';

type DigestDeps = {
  senderPort: MessageSenderPort;
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
      error(`⏰ Failed to load leaderboard for digest ${groupChatId}:`, err);
      return;
    }

    if (ranked.length === 0) {
      debug('⏰ Digest: no leaderboard entries, skipping');
      return;
    }

    const message = formatDigestMessage(ranked);

    try {
      await deps.senderPort.sendMessage(groupChatId, message);
      debug(`⏰ Digest sent to ${groupChatId}`);
    } catch (err) {
      error('⏰ Failed to send digest:', err);
    }
  };
}

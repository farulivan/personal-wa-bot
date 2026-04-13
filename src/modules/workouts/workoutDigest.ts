import { debug, error } from '../../logger.js';
import { formatDigestMessage } from './workoutPresenter.js';
import type { UserStreak } from './workoutPresenter.js';
import type { WorkoutService } from './workoutService.js';
import type { GroupMembershipPort, MessageSenderPort } from '../../adapters/whatsapp/ports.js';
import { resolveGroupDbUserIds } from '../../adapters/whatsapp/resolveGroupDbUserIds.js';

type DigestDeps = {
  membershipPort: GroupMembershipPort;
  senderPort: MessageSenderPort;
  workoutService: WorkoutService;
  timezoneOffsetMinutes: number;
};

export function createDailyStreakDigestSender(deps: DigestDeps) {
  return async function sendDailyStreakDigest(groupChatId: string): Promise<void> {
    const now = new Date();

    let standings: UserStreak[];
    try {
      const dbUsers = await deps.workoutService.listDistinctUsers();
      const targetUserIds = await resolveGroupDbUserIds(deps.membershipPort, groupChatId, dbUsers);

      if (targetUserIds.length === 0) {
        debug('⏰ Digest: no valid group participants, skipping');
        return;
      }

      const standingsRaw = await Promise.all(
        targetUserIds.map(async (userId) => {
          const streaks = await deps.workoutService.getStreaksByUser(
            userId,
            deps.timezoneOffsetMinutes,
            now
          );
          const name = await deps.workoutService.getDisplayName(userId);
          return { name, current: streaks.current, best: streaks.best };
        })
      );

      standings = standingsRaw
        .filter((s) => s.current > 0 || s.best > 0)
        .sort((a, b) => b.current - a.current || b.best - a.best);
    } catch (err) {
      error(`⏰ Failed to load group participants for digest ${groupChatId}:`, err);
      return;
    }

    if (standings.length === 0) {
      debug('⏰ Digest: no active streaks, skipping');
      return;
    }

    const message = formatDigestMessage(standings);

    try {
      await deps.senderPort.sendMessage(groupChatId, message);
      debug(`⏰ Digest sent to ${groupChatId}`);
    } catch (err) {
      error('⏰ Failed to send digest:', err);
    }
  };
}

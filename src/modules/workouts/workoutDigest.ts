import { debug, error } from '../../logger.js';
import { formatDigestMessage } from './workoutPresenter.js';
import type { WorkoutService } from './workoutService.js';
import type { GroupMembershipPort, MessageSenderPort } from '../../adapters/whatsapp/ports.js';

type DigestDeps = {
  membershipPort: GroupMembershipPort;
  senderPort: MessageSenderPort;
  workoutService: WorkoutService;
  timezoneOffsetMinutes: number;
};

export function createDailyStreakDigestSender(deps: DigestDeps) {
  return async function sendDailyStreakDigest(groupChatId: string): Promise<void> {
    const now = new Date();

    let standings;
    try {
      standings = await deps.workoutService.getDigestStandings(
        deps.membershipPort,
        groupChatId,
        deps.timezoneOffsetMinutes,
        now
      );
    } catch (err) {
      error(`⏰ Failed to load group participants for digest ${groupChatId}:`, err);
      return;
    }

    if (standings.length === 0) {
      debug('⏰ Digest: no valid group participants, skipping');
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

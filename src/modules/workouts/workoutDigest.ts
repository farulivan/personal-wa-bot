import { debug, error } from '../../logger.js';
import { formatDigestMessage } from './workoutPresenter.js';
import type { WorkoutService, DigestClientLike } from './workoutService.js';
import type { WhatsAppSenderLike } from '../../adapters/whatsapp/types.js';

type DigestClientFull = WhatsAppSenderLike & DigestClientLike;

type DigestDeps = {
  client: DigestClientFull;
  workoutService: WorkoutService;
  timezoneOffsetMinutes: number;
};

export function createDailyStreakDigestSender(deps: DigestDeps) {
  return async function sendDailyStreakDigest(groupChatId: string): Promise<void> {
    const now = new Date();

    let standings;
    try {
      standings = await deps.workoutService.getDigestStandings(
        deps.client,
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
      await deps.client.sendMessage(groupChatId, message);
      debug(`⏰ Digest sent to ${groupChatId}`);
    } catch (err) {
      error('⏰ Failed to send digest:', err);
    }
  };
}

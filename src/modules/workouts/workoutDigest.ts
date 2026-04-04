import { computeStreaks } from './workoutStreaks.js';
import { debug, error } from '../../logger.js';
import type { WorkoutRepository } from './infra/workoutRepository.js';
import type { UserRepository } from '../users/infra/userRepository.js';
import {
  listGroupMemberIdentities,
  resolveNormalizedBotUserId,
  type BotInfoClientLike,
  type GroupMemberClientLike,
} from '../../adapters/whatsapp/waId.js';

type WhatsAppClientLike = {
  sendMessage: (chatId: string, text: string) => Promise<unknown>;
} & GroupMemberClientLike &
  BotInfoClientLike;

type DigestDeps = {
  client: WhatsAppClientLike;
  workoutRepository: WorkoutRepository;
  userRepository: UserRepository;
  timezoneOffsetMinutes: number;
};

type UserStreak = {
  name: string;
  current: number;
  best: number;
};

export function createDailyStreakDigestSender(deps: DigestDeps) {
  return async function sendDailyStreakDigest(groupChatId: string): Promise<void> {
    const now = new Date();

    let targetUserIds: string[];

    try {
      const [memberIdentities, botUserId, dbUsers] = await Promise.all([
        listGroupMemberIdentities(deps.client, groupChatId),
        resolveNormalizedBotUserId(deps.client),
        deps.workoutRepository.listDistinctUsers(),
      ]);

      const groupMemberIdentities = botUserId
        ? memberIdentities.filter((member) => !member.aliases.includes(botUserId))
        : memberIdentities;

      const knownUsers = new Set(dbUsers);
      const targetUserIdSet = new Set<string>();

      for (const member of groupMemberIdentities) {
        const matchedDbId = member.aliases.find((alias: string) => knownUsers.has(alias));
        const dbUserId = matchedDbId ?? member.primaryId;
        targetUserIdSet.add(dbUserId);
      }

      targetUserIds = Array.from(targetUserIdSet);
    } catch (err) {
      error(`⏰ Failed to load group participants for digest ${groupChatId}:`, err);
      return;
    }

    if (targetUserIds.length === 0) {
      debug('⏰ Digest: no valid group participants, skipping');
      return;
    }

    const standingsRaw = await Promise.all(
      targetUserIds.map(async (userId) => {
        const days = await deps.workoutRepository.getQualifyingStreakDays(
          userId,
          deps.timezoneOffsetMinutes
        );
        const streaks = computeStreaks(days, deps.timezoneOffsetMinutes, now);
        const name = await deps.userRepository.getDisplayName(userId);
        return { name, current: streaks.current, best: streaks.best };
      })
    );

    const standings: UserStreak[] = standingsRaw
      .filter((standing) => standing.current > 0 || standing.best > 0)
      .sort((a, b) => b.current - a.current || b.best - a.best);

    const top3 = standings.slice(0, 3);
    const rest = standings.slice(3);

    const top3Lines = top3.map((user, index) => {
      const medal = ['🥇', '🥈', '🥉'][index];
      return `${medal} ${user.name} – ${user.current} days (best: ${user.best})`;
    });

    const restLines = rest.map((user) => {
      return `🔹 ${user.name} – ${user.current} days (best: ${user.best})`;
    });

    const message = `Morning team 👋\n\n${top3Lines.join('\n')}\n\n${restLines.join('\n')}\n\nKeep showing up. Consistency wins. 💪`;

    try {
      await deps.client.sendMessage(groupChatId, message);
      debug(`⏰ Digest sent to ${groupChatId}`);
    } catch (err) {
      error('⏰ Failed to send digest:', err);
    }
  };
}

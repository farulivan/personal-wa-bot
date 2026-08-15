import { toWaUserId } from '../../shared/identity.js';
import type { WaUserId } from '../../shared/identity.js';
import { describe, it, expect, vi } from 'vitest';
import {
  createDailyStreakDigestSender,
  createMonthlyWorkoutDigestSender,
} from './workoutDigest.js';
import type { WorkoutService, WorkoutLeaderboardEntry } from './workoutService.js';
import type {
  GroupMembershipPort,
  GroupMemberIdentity,
  MessageSenderPort,
} from '../../adapters/whatsapp/ports.js';

const GROUP = 'group@g.us';
const TZ = 420;

function stubSenderPort() {
  const sendMessage = vi.fn(
    async (_chatId: string, _text: string, _mentions?: string[]): Promise<unknown> => undefined
  );
  const senderPort: MessageSenderPort = { sendMessage };
  return { senderPort, sendMessage };
}

function stubMembershipPort(
  identities: GroupMemberIdentity[],
  botUserId: WaUserId | null = null
): GroupMembershipPort {
  return {
    listMemberIdentities: async () => identities,
    resolveBotUserId: async () => botUserId,
  };
}

function stubWorkoutService(fns: {
  getLeaderboard?: () => Promise<{ entries: WorkoutLeaderboardEntry[] }>;
  getLastMonthLeaderboard?: () => Promise<{
    entries: WorkoutLeaderboardEntry[];
    monthLabel: string;
  }>;
}): WorkoutService {
  return {
    getLeaderboard: fns.getLeaderboard ?? (async () => ({ entries: [] })),
    getLastMonthLeaderboard:
      fns.getLastMonthLeaderboard ?? (async () => ({ entries: [], monthLabel: 'June 2026' })),
  } as unknown as WorkoutService;
}

function entry(phoneNumber: string | null, user: string, atRisk: boolean): WorkoutLeaderboardEntry {
  return { phoneNumber, user, sessionsInMonth: 10, currentStreak: 5, bestStreak: 5, atRisk };
}

const inGroup = (phone: string): GroupMemberIdentity => ({
  primaryId: toWaUserId(phone),
  aliases: [toWaUserId(phone)],
});

describe('createDailyStreakDigestSender', () => {
  it('sends the leaderboard and @mentions at-risk members who are in the group', async () => {
    const { senderPort, sendMessage } = stubSenderPort();
    const send = createDailyStreakDigestSender({
      senderPort,
      membershipPort: stubMembershipPort([inGroup('628111111111')]),
      workoutService: stubWorkoutService({
        getLeaderboard: async () => ({ entries: [entry('628111111111', 'Alice', true)] }),
      }),
      timezoneOffsetMinutes: TZ,
    });

    await send(GROUP);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text, mentions] = sendMessage.mock.calls[0];
    expect(chatId).toBe(GROUP);
    expect(text).toContain('Workout Leaderboard This Month');
    expect(text).toContain('@628111111111');
    expect(mentions).toEqual(['628111111111']);
  });

  it('sends nothing when the leaderboard is empty', async () => {
    const { senderPort, sendMessage } = stubSenderPort();
    const send = createDailyStreakDigestSender({
      senderPort,
      membershipPort: stubMembershipPort([]),
      workoutService: stubWorkoutService({ getLeaderboard: async () => ({ entries: [] }) }),
      timezoneOffsetMinutes: TZ,
    });

    await send(GROUP);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('swallows a leaderboard-load failure without sending or throwing', async () => {
    const { senderPort, sendMessage } = stubSenderPort();
    const send = createDailyStreakDigestSender({
      senderPort,
      membershipPort: stubMembershipPort([]),
      workoutService: stubWorkoutService({
        getLeaderboard: async () => {
          throw new Error('db down');
        },
      }),
      timezoneOffsetMinutes: TZ,
    });

    await expect(send(GROUP)).resolves.toBeUndefined();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('swallows a send failure without throwing', async () => {
    const sendMessage = vi.fn(async () => {
      throw new Error('send failed');
    });
    const senderPort = { sendMessage } as unknown as MessageSenderPort;
    const send = createDailyStreakDigestSender({
      senderPort,
      membershipPort: stubMembershipPort([inGroup('628111111111')]),
      workoutService: stubWorkoutService({
        getLeaderboard: async () => ({ entries: [entry('628111111111', 'Alice', false)] }),
      }),
      timezoneOffsetMinutes: TZ,
    });

    await expect(send(GROUP)).resolves.toBeUndefined();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('createMonthlyWorkoutDigestSender', () => {
  it('sends the monthly recap with the month label', async () => {
    const { senderPort, sendMessage } = stubSenderPort();
    const send = createMonthlyWorkoutDigestSender({
      senderPort,
      membershipPort: stubMembershipPort([]),
      workoutService: stubWorkoutService({
        getLastMonthLeaderboard: async () => ({
          entries: [entry('628111111111', 'Alice', false)],
          monthLabel: 'June 2026',
        }),
      }),
      timezoneOffsetMinutes: TZ,
    });

    await send(GROUP);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = sendMessage.mock.calls[0];
    expect(chatId).toBe(GROUP);
    expect(text).toContain('Monthly Workout Recap — June 2026');
    expect(text).toContain('🥇');
  });

  it('still sends an empty-month recap when nobody logged (unlike the daily digest)', async () => {
    const { senderPort, sendMessage } = stubSenderPort();
    const send = createMonthlyWorkoutDigestSender({
      senderPort,
      membershipPort: stubMembershipPort([]),
      workoutService: stubWorkoutService({
        getLastMonthLeaderboard: async () => ({ entries: [], monthLabel: 'June 2026' }),
      }),
      timezoneOffsetMinutes: TZ,
    });

    await send(GROUP);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][1]).toContain('No workouts were logged last month');
  });

  it('swallows a monthly-load failure without sending or throwing', async () => {
    const { senderPort, sendMessage } = stubSenderPort();
    const send = createMonthlyWorkoutDigestSender({
      senderPort,
      membershipPort: stubMembershipPort([]),
      workoutService: stubWorkoutService({
        getLastMonthLeaderboard: async () => {
          throw new Error('db down');
        },
      }),
      timezoneOffsetMinutes: TZ,
    });

    await expect(send(GROUP)).resolves.toBeUndefined();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

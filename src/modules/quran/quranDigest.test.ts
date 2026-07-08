import { describe, it, expect, vi } from 'vitest';
import { createQuranReminderSender } from './quranDigest.js';
import type { QuranService } from './quranService.js';
import type {
  GroupMembershipPort,
  GroupMemberIdentity,
  MessageSenderPort,
} from '../../adapters/whatsapp/ports.js';

type ReminderData = Awaited<ReturnType<QuranService['getReminderDataForUser']>>;

function stubMembershipPort(
  identities: GroupMemberIdentity[],
  botUserId: string | null = null
): GroupMembershipPort {
  return {
    listMemberIdentities: async () => identities,
    resolveBotUserId: async () => botUserId,
  };
}

function stubQuranService(distinctUsers: string[], reminderDataById: Record<string, ReminderData>) {
  const getReminderDataForUser = vi.fn(
    async (userId: string, _timezoneOffsetMinutes: number, _now: Date): Promise<ReminderData> => {
      const data = reminderDataById[userId];
      if (!data) throw new Error(`unexpected getReminderDataForUser call: ${userId}`);
      return data;
    }
  );
  const service = {
    listDistinctUsers: async () => distinctUsers,
    getReminderDataForUser,
  } as unknown as QuranService;
  return { service, getReminderDataForUser };
}

function stubSenderPort() {
  const sendMessage = vi.fn(
    async (_chatId: string, _text: string, _mentions?: string[]): Promise<unknown> => undefined
  );
  const senderPort: MessageSenderPort = { sendMessage };
  return { senderPort, sendMessage };
}

describe('createQuranReminderSender', () => {
  const GROUP = 'group@g.us';

  it('addresses only group members who have reading data', async () => {
    const { senderPort, sendMessage } = stubSenderPort();

    const membershipPort = stubMembershipPort([
      { primaryId: '628111111111', aliases: ['628111111111'] }, // has data
      { primaryId: '628999999999', aliases: ['628999999999'] }, // no data, in group
    ]);

    const { service, getReminderDataForUser } = stubQuranService(['628111111111'], {
      '628111111111': {
        phoneNumber: '628111111111',
        name: 'Aisyah',
        hasRead: false,
        currentStreak: 3,
      },
    });

    const send = createQuranReminderSender({
      membershipPort,
      senderPort,
      quranService: service,
      timezoneOffsetMinutes: 420,
    });

    await send(GROUP);

    // The no-data member is never even looked up.
    expect(getReminderDataForUser).toHaveBeenCalledTimes(1);
    expect(getReminderDataForUser).toHaveBeenCalledWith('628111111111', 420, expect.any(Date));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text, mentions] = sendMessage.mock.calls[0];
    expect(chatId).toBe(GROUP);
    expect(text).toContain('@628111111111');
    expect(text).not.toContain('628999999999');
    expect(mentions).toEqual(['628111111111@c.us']);
  });

  it('sends nothing when no group member has reading data', async () => {
    const { senderPort, sendMessage } = stubSenderPort();

    // A data-user exists globally, but is not a member of this group.
    const membershipPort = stubMembershipPort([
      { primaryId: '628999999999', aliases: ['628999999999'] },
    ]);
    const { service, getReminderDataForUser } = stubQuranService(['628111111111'], {});

    const send = createQuranReminderSender({
      membershipPort,
      senderPort,
      quranService: service,
      timezoneOffsetMinutes: 420,
    });

    await send(GROUP);

    expect(getReminderDataForUser).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('names a member who already read today without mentioning them', async () => {
    const { senderPort, sendMessage } = stubSenderPort();

    const membershipPort = stubMembershipPort([
      { primaryId: '628111111111', aliases: ['628111111111'] },
    ]);
    const { service } = stubQuranService(['628111111111'], {
      '628111111111': {
        phoneNumber: '628111111111',
        name: 'Aisyah',
        hasRead: true,
        currentStreak: 5,
      },
    });

    const send = createQuranReminderSender({
      membershipPort,
      senderPort,
      quranService: service,
      timezoneOffsetMinutes: 420,
    });

    await send(GROUP);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [, text, mentions] = sendMessage.mock.calls[0];
    expect(text).toContain('Aisyah');
    expect(mentions).toEqual([]);
  });
});

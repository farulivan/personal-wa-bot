import { describe, it, expect } from 'vitest';
import { resolveMentionablePhoneNumbers } from './resolveMentionablePhoneNumbers.js';
import type { GroupMembershipPort, GroupMemberIdentity } from './ports.js';

class StubMembershipPort implements GroupMembershipPort {
  constructor(
    private readonly identities: GroupMemberIdentity[],
    private readonly botUserId: string | null = null,
    private readonly listShouldThrow = false
  ) {}

  async listMemberIdentities(_groupId: string): Promise<GroupMemberIdentity[]> {
    if (this.listShouldThrow) throw new Error('boom');
    return this.identities;
  }

  async resolveBotUserId(): Promise<string | null> {
    return this.botUserId;
  }
}

describe('resolveMentionablePhoneNumbers', () => {
  it('returns empty Set when groupChatId is null (DM)', async () => {
    const port = new StubMembershipPort([{ primaryId: '628111111111', aliases: ['628111111111'] }]);
    const result = await resolveMentionablePhoneNumbers(port, null, ['628111111111']);
    expect(result.size).toBe(0);
  });

  it('returns empty Set when no candidate phones are non-null', async () => {
    const port = new StubMembershipPort([{ primaryId: '628111111111', aliases: ['628111111111'] }]);
    const result = await resolveMentionablePhoneNumbers(port, 'group@g.us', [null, null]);
    expect(result.size).toBe(0);
  });

  it('returns only candidate phones that match a group-member alias', async () => {
    const port = new StubMembershipPort([
      { primaryId: '628111111111', aliases: ['628111111111'] },
      { primaryId: '628222222222', aliases: ['628222222222'] },
    ]);
    const result = await resolveMentionablePhoneNumbers(port, 'group@g.us', [
      '628111111111',
      '628222222222',
      '628333333333',
    ]);
    expect(result.has('628111111111')).toBe(true);
    expect(result.has('628222222222')).toBe(true);
    expect(result.has('628333333333')).toBe(false);
  });

  it('matches phones against lid-enriched alias sets (member surfaces both lid and phone aliases)', async () => {
    const port = new StubMembershipPort([
      { primaryId: '12345', aliases: ['12345', '628111111111'] },
    ]);
    const result = await resolveMentionablePhoneNumbers(port, 'group@g.us', ['628111111111']);
    expect(result.has('628111111111')).toBe(true);
  });

  it("excludes the bot's phone from the mentionable set", async () => {
    const port = new StubMembershipPort(
      [
        { primaryId: '628111111111', aliases: ['628111111111'] },
        { primaryId: '628999999999', aliases: ['628999999999'] }, // bot
      ],
      '628999999999'
    );
    const result = await resolveMentionablePhoneNumbers(port, 'group@g.us', [
      '628111111111',
      '628999999999',
    ]);
    expect(result.has('628111111111')).toBe(true);
    expect(result.has('628999999999')).toBe(false);
  });

  it('drops null entries from the candidate list and keeps the rest', async () => {
    const port = new StubMembershipPort([{ primaryId: '628111111111', aliases: ['628111111111'] }]);
    const result = await resolveMentionablePhoneNumbers(port, 'group@g.us', [
      null,
      '628111111111',
      null,
    ]);
    expect([...result]).toEqual(['628111111111']);
  });

  it('returns empty Set on membership-port failure (degrades to no mentions)', async () => {
    const port = new StubMembershipPort([], null, true);
    const result = await resolveMentionablePhoneNumbers(port, 'group@g.us', ['628111111111']);
    expect(result.size).toBe(0);
  });
});

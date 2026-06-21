import { describe, it, expect } from 'vitest';
import { resolveKnownGroupDbUserIds } from './resolveKnownGroupDbUserIds.js';
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

describe('resolveKnownGroupDbUserIds', () => {
  it('returns the matched db id for members whose alias is a known data-user', async () => {
    const port = new StubMembershipPort([
      { primaryId: '628111111111', aliases: ['628111111111'] },
      { primaryId: '628222222222', aliases: ['628222222222'] },
    ]);
    const result = await resolveKnownGroupDbUserIds(port, 'group@g.us', [
      '628111111111',
      '628222222222',
    ]);
    expect([...result].sort()).toEqual(['628111111111', '628222222222']);
  });

  it('excludes a member with no data (no alias in the known set)', async () => {
    const port = new StubMembershipPort([
      { primaryId: '628111111111', aliases: ['628111111111'] }, // has data
      { primaryId: '628999999999', aliases: ['628999999999'] }, // no data
    ]);
    const result = await resolveKnownGroupDbUserIds(port, 'group@g.us', ['628111111111']);
    expect(result).toEqual(['628111111111']);
    expect(result).not.toContain('628999999999');
  });

  it('matches against lid-enriched aliases and returns the known db id', async () => {
    const port = new StubMembershipPort([
      { primaryId: '12345', aliases: ['12345', '628111111111'] },
    ]);
    const result = await resolveKnownGroupDbUserIds(port, 'group@g.us', ['628111111111']);
    expect(result).toEqual(['628111111111']);
  });

  it('excludes the bot even if its id is in the known set', async () => {
    const port = new StubMembershipPort(
      [
        { primaryId: '628111111111', aliases: ['628111111111'] },
        { primaryId: '628999999999', aliases: ['628999999999'] }, // bot
      ],
      '628999999999'
    );
    const result = await resolveKnownGroupDbUserIds(port, 'group@g.us', [
      '628111111111',
      '628999999999',
    ]);
    expect(result).toEqual(['628111111111']);
  });

  it('returns empty when no member matches a known data-user', async () => {
    const port = new StubMembershipPort([{ primaryId: '628999999999', aliases: ['628999999999'] }]);
    const result = await resolveKnownGroupDbUserIds(port, 'group@g.us', ['628111111111']);
    expect(result).toEqual([]);
  });

  it('rejects when the membership port throws (caller decides how to handle)', async () => {
    const port = new StubMembershipPort([], null, true);
    await expect(
      resolveKnownGroupDbUserIds(port, 'group@g.us', ['628111111111'])
    ).rejects.toThrow();
  });
});

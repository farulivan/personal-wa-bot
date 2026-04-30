import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { DrizzleUserRepository } from './drizzleUserRepository.js';
import { setupTestDb, cleanAllTables } from '../../../db/testHelper.js';
import type { DrizzleDb } from '../../../db/drizzle.js';

describe('DrizzleUserRepository.getDisplayNamesByIds', () => {
  let db: DrizzleDb;
  let close: () => Promise<void>;
  let repo: DrizzleUserRepository;

  beforeAll(async () => {
    ({ db, close } = await setupTestDb());
    repo = new DrizzleUserRepository(db);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await cleanAllTables(db);
  });

  it('pushname wins', async () => {
    await repo.upsert({ id: '628111@c.us', pushname: 'alice cooper' });
    const result = await repo.getDisplayNamesByIds(['628111@c.us']);
    expect(result.get('628111@c.us')).toBe('Alice Cooper');
  });

  it('contactName fallback when no pushname', async () => {
    await repo.upsert({ id: '628222@c.us', contactName: 'bob smith' });
    const result = await repo.getDisplayNamesByIds(['628222@c.us']);
    expect(result.get('628222@c.us')).toBe('Bob Smith');
  });

  it('phone-number row chosen for an unknown id', async () => {
    await repo.upsert({ id: 'other-id', phoneNumber: '628333', pushname: 'Carol' });
    const result = await repo.getDisplayNamesByIds(['628333@c.us']);
    expect(result.get('628333@c.us')).toBe('Carol');
  });

  it('unknown id returns normalized id', async () => {
    const result = await repo.getDisplayNamesByIds(['999999@c.us']);
    expect(result.get('999999@c.us')).toBe('999999');
  });

  it('duplicate input ids returns map of size 2', async () => {
    await repo.upsert({ id: '628111@c.us', pushname: 'Alice' });
    await repo.upsert({ id: '628222@c.us', pushname: 'Bob' });
    const result = await repo.getDisplayNamesByIds(['628111@c.us', '628111@c.us', '628222@c.us']);
    expect(result.size).toBe(2);
  });

  it('empty input returns empty map', async () => {
    const result = await repo.getDisplayNamesByIds([]);
    expect(result.size).toBe(0);
  });

  it('bounded query count: findByIds and findBestByPhoneNumbers called at most once for 5 users', async () => {
    const ids = ['628001@c.us', '628002@c.us', '628003@c.us', '628004@c.us', '628005@c.us'];
    for (const id of ids) {
      await repo.upsert({ id, pushname: `User ${id}` });
    }

    const findByIdsSpy = vi.spyOn(repo, 'findByIds');
    const findBestByPhoneNumbersSpy = vi.spyOn(
      repo as unknown as { findBestByPhoneNumbers: (...args: unknown[]) => unknown },
      'findBestByPhoneNumbers'
    );

    await repo.getDisplayNamesByIds(ids);

    expect(findByIdsSpy).toHaveBeenCalledTimes(1);
    expect(findBestByPhoneNumbersSpy.mock.calls.length).toBeLessThanOrEqual(1);

    findByIdsSpy.mockRestore();
    findBestByPhoneNumbersSpy.mockRestore();
  });
});

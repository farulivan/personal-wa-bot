import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleRemindRepository } from './drizzleRemindRepository.js';
import { setupTestDb, cleanAllTables } from '../../../db/testHelper.js';
import type { DrizzleDb } from '../../../db/drizzle.js';

const user = 'test-user-1';
const chatId = 'test-chat@g.us';

function makeReminder(
  overrides: Partial<Parameters<DrizzleRemindRepository['insertReminder']>[0]> = {}
) {
  return {
    userId: user,
    targetChatId: chatId,
    sourceType: 'direct' as const,
    reminderText: 'Buy milk',
    scheduledAt: '2026-12-01T03:00:00.000Z',
    createdAt: '2026-04-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('DrizzleRemindRepository', () => {
  let db: DrizzleDb;
  let close: () => Promise<void>;
  let repo: DrizzleRemindRepository;

  beforeAll(async () => {
    ({ db, close } = await setupTestDb());
    repo = new DrizzleRemindRepository(db);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await cleanAllTables(db);
  });

  describe('insertReminder + countByUser', () => {
    it('inserts and counts reminders', async () => {
      await repo.insertReminder(makeReminder());
      await repo.insertReminder(makeReminder({ reminderText: 'Call dentist' }));

      expect(await repo.countByUser(user)).toBe(2);
      expect(await repo.countByUser('other-user')).toBe(0);
    });
  });

  describe('countActiveByUser', () => {
    it('counts only unsent reminders', async () => {
      await repo.insertReminder(makeReminder());
      await repo.insertReminder(makeReminder({ reminderText: 'Task 2' }));

      // Mark first as sent
      const rows = await repo.listByUser(user, 10, 0);
      await repo.markAsSent(rows[0].id, '2026-04-12T12:00:00.000Z');

      expect(await repo.countActiveByUser(user)).toBe(1);
    });
  });

  describe('listByUser', () => {
    it('returns reminders ordered by createdAt DESC', async () => {
      await repo.insertReminder(
        makeReminder({ createdAt: '2026-04-12T08:00:00.000Z', reminderText: 'First' })
      );
      await repo.insertReminder(
        makeReminder({ createdAt: '2026-04-12T10:00:00.000Z', reminderText: 'Second' })
      );

      const rows = await repo.listByUser(user, 10, 0);
      expect(rows).toHaveLength(2);
      expect(rows[0].reminderText).toBe('Second');
      expect(rows[1].reminderText).toBe('First');
    });

    it('respects limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.insertReminder(makeReminder({ reminderText: `Task ${i}` }));
      }

      const page = await repo.listByUser(user, 2, 2);
      expect(page).toHaveLength(2);
    });
  });

  describe('listDuePending', () => {
    it('returns unsent reminders scheduled at or before now', async () => {
      await repo.insertReminder(makeReminder({ scheduledAt: '2026-04-12T08:00:00.000Z' }));
      await repo.insertReminder(
        makeReminder({ scheduledAt: '2026-12-01T00:00:00.000Z', reminderText: 'Future' })
      );

      const due = await repo.listDuePending('2026-04-12T10:00:00.000Z', 10);
      expect(due).toHaveLength(1);
      expect(due[0].reminderText).toBe('Buy milk');
    });

    it('excludes already-sent reminders', async () => {
      await repo.insertReminder(makeReminder({ scheduledAt: '2026-04-12T08:00:00.000Z' }));

      const rows = await repo.listByUser(user, 10, 0);
      await repo.markAsSent(rows[0].id, '2026-04-12T09:00:00.000Z');

      const due = await repo.listDuePending('2026-04-12T10:00:00.000Z', 10);
      expect(due).toHaveLength(0);
    });
  });

  describe('markAsSent', () => {
    it('sets sentAt on the reminder', async () => {
      await repo.insertReminder(makeReminder());
      const rows = await repo.listByUser(user, 10, 0);

      await repo.markAsSent(rows[0].id, '2026-04-12T12:00:00.000Z');

      const updated = await repo.listByUser(user, 10, 0);
      expect(updated[0].sentAt).toBe('2026-04-12T12:00:00.000Z');
    });

    it('does not re-mark already sent reminders', async () => {
      await repo.insertReminder(makeReminder());
      const rows = await repo.listByUser(user, 10, 0);

      await repo.markAsSent(rows[0].id, '2026-04-12T12:00:00.000Z');
      await repo.markAsSent(rows[0].id, '2026-04-12T14:00:00.000Z');

      const updated = await repo.listByUser(user, 10, 0);
      expect(updated[0].sentAt).toBe('2026-04-12T12:00:00.000Z');
    });
  });

  describe('findLastActiveByUser', () => {
    it('returns null when the user has no reminders', async () => {
      expect(await repo.findLastActiveByUser(user)).toBeNull();
    });

    it('returns the newest unsent reminder', async () => {
      await repo.insertReminder(
        makeReminder({ createdAt: '2026-04-12T08:00:00.000Z', reminderText: 'First' })
      );
      await repo.insertReminder(
        makeReminder({ createdAt: '2026-04-12T10:00:00.000Z', reminderText: 'Second' })
      );

      const latest = await repo.findLastActiveByUser(user);
      expect(latest?.reminderText).toBe('Second');
    });

    it('skips sent reminders', async () => {
      await repo.insertReminder(
        makeReminder({ createdAt: '2026-04-12T08:00:00.000Z', reminderText: 'First' })
      );
      await repo.insertReminder(
        makeReminder({ createdAt: '2026-04-12T10:00:00.000Z', reminderText: 'Second' })
      );

      const rows = await repo.listByUser(user, 10, 0);
      // Mark the newest (Second) as sent
      await repo.markAsSent(rows[0].id, '2026-04-12T10:30:00.000Z');

      const latest = await repo.findLastActiveByUser(user);
      expect(latest?.reminderText).toBe('First');
    });
  });

  describe('softDeleteById (undo)', () => {
    it('hides the reminder from countByUser, listByUser, and listDuePending', async () => {
      await repo.insertReminder(
        makeReminder({ scheduledAt: '2026-04-12T08:00:00.000Z', reminderText: 'Due task' })
      );
      const rows = await repo.listByUser(user, 10, 0);
      const targetId = rows[0].id;

      await repo.softDeleteById(targetId, '2026-04-12T09:00:00.000Z');

      expect(await repo.countByUser(user)).toBe(0);
      expect(await repo.countActiveByUser(user)).toBe(0);
      expect(await repo.listByUser(user, 10, 0)).toHaveLength(0);
      expect(await repo.listDuePending('2026-04-12T10:00:00.000Z', 10)).toHaveLength(0);
    });

    it('excludes soft-deleted reminders from findLastActiveByUser', async () => {
      await repo.insertReminder(
        makeReminder({ createdAt: '2026-04-12T08:00:00.000Z', reminderText: 'First' })
      );
      await repo.insertReminder(
        makeReminder({ createdAt: '2026-04-12T10:00:00.000Z', reminderText: 'Second' })
      );
      const rows = await repo.listByUser(user, 10, 0);
      // Soft-delete the newest (Second)
      await repo.softDeleteById(rows[0].id, '2026-04-12T10:30:00.000Z');

      const latest = await repo.findLastActiveByUser(user);
      expect(latest?.reminderText).toBe('First');
    });

    it('is idempotent when called twice on the same id', async () => {
      await repo.insertReminder(makeReminder());
      const rows = await repo.listByUser(user, 10, 0);
      const targetId = rows[0].id;

      await repo.softDeleteById(targetId, '2026-04-12T09:00:00.000Z');
      await repo.softDeleteById(targetId, '2026-04-12T11:00:00.000Z'); // no-op

      expect(await repo.countByUser(user)).toBe(0);
    });
  });
});

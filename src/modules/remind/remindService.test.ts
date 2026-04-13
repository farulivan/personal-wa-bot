import { describe, it, expect, beforeEach } from 'vitest';
import { RemindService } from './remindService.js';
import type {
  RemindRepository,
  NewReminder,
  ReminderListRow,
  DueReminderRow,
} from './infra/remindRepository.js';
import { parseReminderCommand } from './remindParser.js';

class InMemoryRemindRepository implements RemindRepository {
  private rows: ReminderListRow[] = [];
  private nextId = 1;

  async insertReminder(input: NewReminder): Promise<void> {
    this.rows.push({
      id: this.nextId++,
      userId: input.userId,
      targetChatId: input.targetChatId,
      sourceType: input.sourceType,
      reminderText: input.reminderText,
      scheduledAt: input.scheduledAt,
      createdAt: input.createdAt,
      sentAt: null,
    });
  }

  async countByUser(userId: string): Promise<number> {
    return this.rows.filter((r) => r.userId === userId).length;
  }

  async countActiveByUser(userId: string): Promise<number> {
    return this.rows.filter((r) => r.userId === userId && r.sentAt === null).length;
  }

  async listByUser(userId: string, limit: number, offset: number): Promise<ReminderListRow[]> {
    return this.rows.filter((r) => r.userId === userId).slice(offset, offset + limit);
  }

  async listDuePending(_nowIso: string, _limit: number): Promise<DueReminderRow[]> {
    return [];
  }

  async markAsSent(id: number, sentAt: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.sentAt = sentAt;
  }
}

describe('RemindService', () => {
  let repo: InMemoryRemindRepository;
  let service: RemindService;

  const TZ = 420;
  const now = new Date('2026-04-08T10:00:00Z');
  const user = '628111111111@c.us';
  const chatId = '628111111111@c.us';

  function parse(text: string) {
    const result = parseReminderCommand(text);
    if (!result.ok) throw new Error(`Parse failed: ${result.error}`);
    return result.value;
  }

  beforeEach(() => {
    repo = new InMemoryRemindRepository();
    service = new RemindService(repo, 10);
  });

  describe('createReminder', () => {
    it('creates a reminder for a future date', async () => {
      const parsed = parse('#remind 2026-12-01 10:00 Buy milk');
      const result = await service.createReminder(user, chatId, false, parsed, TZ, now);
      expect(result.ok).toBe(true);
      expect(await repo.countByUser(user)).toBe(1);
    });

    it('rejects a reminder in the past', async () => {
      const parsed = parse('#remind 2020-01-01 10:00 Old task');
      const result = await service.createReminder(user, chatId, false, parsed, TZ, now);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.reason).toBe('past_time');
    });

    it('rejects when active limit is reached', async () => {
      const limitedService = new RemindService(repo, 10, 50);
      const parsed = parse('#remind 2026-12-01 10:00 Task');

      for (let i = 0; i < 50; i++) {
        await repo.insertReminder({
          userId: user,
          targetChatId: chatId,
          sourceType: 'direct',
          reminderText: `task ${i}`,
          scheduledAt: '2026-12-01T03:00:00.000Z',
          createdAt: now.toISOString(),
        });
      }

      const result = await limitedService.createReminder(user, chatId, false, parsed, TZ, now);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.reason).toBe('active_limit');
    });
  });

  describe('listReminders', () => {
    it('returns empty list for new user', async () => {
      const result = await service.listReminders(user, 1);
      expect(result.total).toBe(0);
      expect(result.rows).toHaveLength(0);
      expect(result.totalPages).toBe(1);
    });

    it('paginates correctly with custom limit', async () => {
      const smallService = new RemindService(repo, 3);
      const parsed = parse('#remind 2026-12-01 10:00 Task');
      for (let i = 0; i < 7; i++) {
        await smallService.createReminder(user, chatId, false, parsed, TZ, now);
      }
      const page1 = await smallService.listReminders(user, 1);
      expect(page1.total).toBe(7);
      expect(page1.totalPages).toBe(3);
      expect(page1.rows).toHaveLength(3);

      const page3 = await smallService.listReminders(user, 3);
      expect(page3.rows).toHaveLength(1);
    });
  });
});

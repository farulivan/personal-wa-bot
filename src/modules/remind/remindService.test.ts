import { describe, it, expect, beforeEach } from 'vitest';
import { RemindService, REMIND_UNDO_WINDOW_MS } from './remindService.js';
import type {
  RemindRepository,
  NewReminder,
  ReminderListRow,
  DueReminderRow,
} from './infra/remindRepository.js';
import { parseReminderCommand } from './remindParser.js';

type InternalReminderRow = ReminderListRow & { deletedAt: string | null };

class InMemoryRemindRepository implements RemindRepository {
  private rows: InternalReminderRow[] = [];
  private nextId = 1;

  private active(): InternalReminderRow[] {
    return this.rows.filter((r) => r.deletedAt === null);
  }

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
      deletedAt: null,
    });
  }

  async countByUser(userId: string): Promise<number> {
    return this.active().filter((r) => r.userId === userId).length;
  }

  async countActiveByUser(userId: string): Promise<number> {
    return this.active().filter((r) => r.userId === userId && r.sentAt === null).length;
  }

  async listByUser(userId: string, limit: number, offset: number): Promise<ReminderListRow[]> {
    return this.active()
      .filter((r) => r.userId === userId)
      .slice(offset, offset + limit)
      .map(toReminderListRow);
  }

  async listDuePending(nowIso: string, limit: number): Promise<DueReminderRow[]> {
    return this.active()
      .filter((r) => r.sentAt === null && r.scheduledAt <= nowIso)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .slice(0, limit)
      .map(toReminderListRow);
  }

  async claimDueReminders(nowIso: string, limit: number): Promise<DueReminderRow[]> {
    const candidates = this.active()
      .filter((r) => r.sentAt === null && r.scheduledAt <= nowIso)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .slice(0, limit);
    for (const r of candidates) {
      r.sentAt = nowIso;
    }
    return candidates.map(toReminderListRow);
  }

  async markAsSent(id: number, sentAt: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row && row.sentAt === null && row.deletedAt === null) row.sentAt = sentAt;
  }

  async findLastActiveByUser(userId: string): Promise<ReminderListRow | null> {
    const candidate = this.active()
      .filter((r) => r.userId === userId && r.sentAt === null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return candidate ? toReminderListRow(candidate) : null;
  }

  async softDeleteById(id: number, deletedAtIso: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row && row.deletedAt === null) row.deletedAt = deletedAtIso;
  }
}

function toReminderListRow(row: InternalReminderRow): ReminderListRow {
  return {
    id: row.id,
    userId: row.userId,
    targetChatId: row.targetChatId,
    sourceType: row.sourceType,
    reminderText: row.reminderText,
    scheduledAt: row.scheduledAt,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
  };
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

  describe('undoLastReminder', () => {
    const parsed = parseReminderCommand('#remind 2026-12-01 10:00 Buy milk');
    if (!parsed.ok) throw new Error('fixture parse failed');
    const fixture = parsed.value;

    it('returns no_reminders when user has none', async () => {
      const result = await service.undoLastReminder(user, now);
      expect(result.undone).toBe(false);
      if (!result.undone) {
        expect(result.reason).toBe('no_reminders');
      }
    });

    it('soft-deletes the most recent active reminder within window', async () => {
      await service.createReminder(user, chatId, false, fixture, TZ, now);
      const undoTime = new Date(now.getTime() + 2 * 60 * 1000);

      const result = await service.undoLastReminder(user, undoTime);
      expect(result.undone).toBe(true);
      if (result.undone) {
        expect(result.entry.reminderText).toBe('Buy milk');
      }
      expect(await repo.countByUser(user)).toBe(0);
      expect(await repo.countActiveByUser(user)).toBe(0);
      const list = await service.listReminders(user, 1);
      expect(list.total).toBe(0);
    });

    it('undoes the newest reminder when multiple exist', async () => {
      const earlier = new Date('2026-04-08T09:00:00Z');
      const latestParsed = parseReminderCommand('#remind 2026-12-02 11:00 Second task');
      if (!latestParsed.ok) throw new Error('fixture parse failed');

      await service.createReminder(user, chatId, false, fixture, TZ, earlier);
      await service.createReminder(user, chatId, false, latestParsed.value, TZ, now);

      const undoTime = new Date(now.getTime() + 1 * 60 * 1000);
      const result = await service.undoLastReminder(user, undoTime);
      expect(result.undone).toBe(true);
      if (result.undone) {
        expect(result.entry.reminderText).toBe('Second task');
      }
      expect(await repo.countByUser(user)).toBe(1);
    });

    it('rejects undo after the window and surfaces the last entry', async () => {
      await service.createReminder(user, chatId, false, fixture, TZ, now);
      const tooLate = new Date(now.getTime() + REMIND_UNDO_WINDOW_MS + 60 * 1000);

      const result = await service.undoLastReminder(user, tooLate);
      expect(result.undone).toBe(false);
      if (!result.undone) {
        expect(result.reason).toBe('too_late');
        if (result.reason === 'too_late') {
          expect(result.entry.reminderText).toBe('Buy milk');
        }
      }
      expect(await repo.countByUser(user)).toBe(1);
    });

    it('second undo after a successful undo returns no_reminders', async () => {
      await service.createReminder(user, chatId, false, fixture, TZ, now);
      await service.undoLastReminder(user, new Date(now.getTime() + 1000));

      const result = await service.undoLastReminder(user, new Date(now.getTime() + 2000));
      expect(result.undone).toBe(false);
      if (!result.undone) {
        expect(result.reason).toBe('no_reminders');
      }
    });

    it('ignores already-sent reminders as undo candidates', async () => {
      await service.createReminder(user, chatId, false, fixture, TZ, now);
      const rows = await repo.listByUser(user, 10, 0);
      await repo.markAsSent(rows[0].id, now.toISOString());

      const result = await service.undoLastReminder(user, new Date(now.getTime() + 1000));
      expect(result.undone).toBe(false);
      if (!result.undone) {
        expect(result.reason).toBe('no_reminders');
      }
    });

    it('scheduler listDuePending skips undone reminders', async () => {
      const pastSchedule = parseReminderCommand('#remind 2026-04-08 17:30 Past task');
      if (!pastSchedule.ok) throw new Error('fixture parse failed');
      await service.createReminder(user, chatId, false, pastSchedule.value, TZ, now);
      await service.undoLastReminder(user, new Date(now.getTime() + 1000));

      const due = await repo.listDuePending(
        new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        10
      );
      expect(due).toHaveLength(0);
    });

    it('frees an active-limit slot after undo', async () => {
      const tinyService = new RemindService(repo, 10, 2);
      for (let i = 0; i < 2; i++) {
        await repo.insertReminder({
          userId: user,
          targetChatId: chatId,
          sourceType: 'direct',
          reminderText: `slot ${i}`,
          scheduledAt: '2026-12-01T03:00:00.000Z',
          createdAt: now.toISOString(),
        });
      }

      const blockedBefore = await tinyService.createReminder(user, chatId, false, fixture, TZ, now);
      expect(blockedBefore.ok).toBe(false);

      await tinyService.undoLastReminder(user, new Date(now.getTime() + 1000));

      const allowedAfter = await tinyService.createReminder(
        user,
        chatId,
        false,
        fixture,
        TZ,
        new Date(now.getTime() + 2000)
      );
      expect(allowedAfter.ok).toBe(true);
    });
  });
});

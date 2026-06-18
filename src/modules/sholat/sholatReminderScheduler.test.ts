import { describe, it, expect } from 'vitest';
import { SholatReminderTicker } from './sholatReminderScheduler.js';
import type { TodaySchedule } from './sholatService.js';

function makeToday(): TodaySchedule {
  return {
    locationName: 'KAB. BOGOR',
    schedule: {
      locationId: '1302',
      scheduleDate: '2026-06-17',
      timezone: 'Asia/Jakarta',
      displayDate: 'Rabu, 17 Jun 2026',
      imsak: '04:30',
      subuh: '04:40',
      terbit: '05:50',
      dhuha: '06:15',
      dzuhur: '11:57',
      ashar: '15:10',
      maghrib: '17:49',
      isya: '19:00',
    },
  };
}

class FakeSender {
  sent: Array<{ chatId: string; text: string }> = [];
  async sendMessage(chatId: string, text: string): Promise<unknown> {
    this.sent.push({ chatId, text });
    return undefined;
  }
}

const TZ = 420; // GMT+7
// 11:57 GMT+7 == 04:57 UTC
const dzuhurNow = new Date('2026-06-17T04:57:00Z');
// 12:00 GMT+7 == 05:00 UTC (no prayer)
const offPrayerNow = new Date('2026-06-17T05:00:00Z');

function makeTicker(opts: { today: TodaySchedule | null; chats: string[]; sender: FakeSender }) {
  return new SholatReminderTicker({
    sholatService: { getCachedTodaySchedule: async () => opts.today },
    sholatRepository: { listEnabledReminderChats: async () => opts.chats },
    senderPort: opts.sender,
    timezoneOffsetMinutes: TZ,
  });
}

describe('SholatReminderTicker', () => {
  it('sends a reminder to each enabled chat at the prayer minute', async () => {
    const sender = new FakeSender();
    const ticker = makeTicker({ today: makeToday(), chats: ['a@c.us', 'b@g.us'], sender });

    await ticker.tick(dzuhurNow);

    expect(sender.sent.map((s) => s.chatId)).toEqual(['a@c.us', 'b@g.us']);
    expect(sender.sent[0].text).toContain('Dzuhur');
    expect(sender.sent[0].text).toContain('11:57');
  });

  it('does not send the same prayer twice within the day', async () => {
    const sender = new FakeSender();
    const ticker = makeTicker({ today: makeToday(), chats: ['a@c.us'], sender });

    await ticker.tick(dzuhurNow);
    await ticker.tick(dzuhurNow);

    expect(sender.sent).toHaveLength(1);
  });

  it('does nothing when no prayer matches the current minute', async () => {
    const sender = new FakeSender();
    const ticker = makeTicker({ today: makeToday(), chats: ['a@c.us'], sender });

    await ticker.tick(offPrayerNow);

    expect(sender.sent).toEqual([]);
  });

  it('skips silently when today is not cached yet', async () => {
    const sender = new FakeSender();
    const ticker = makeTicker({ today: null, chats: ['a@c.us'], sender });

    await ticker.tick(dzuhurNow);

    expect(sender.sent).toEqual([]);
  });

  it('does not send when no chats are enabled', async () => {
    const sender = new FakeSender();
    const ticker = makeTicker({ today: makeToday(), chats: [], sender });

    await ticker.tick(dzuhurNow);

    expect(sender.sent).toEqual([]);
  });
});

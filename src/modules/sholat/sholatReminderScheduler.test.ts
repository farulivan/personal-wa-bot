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

// Let fire-and-forget background warms settle before assertions.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

type TickerOpts = {
  cache: { today: TodaySchedule | null };
  chats: string[];
  sender: FakeSender;
  warmCache?: () => Promise<void>;
};

function makeTicker(opts: TickerOpts) {
  return new SholatReminderTicker({
    sholatService: { getCachedTodaySchedule: async () => opts.cache.today },
    sholatRepository: { listEnabledReminderChats: async () => opts.chats },
    senderPort: opts.sender,
    timezoneOffsetMinutes: TZ,
    warmCache: opts.warmCache ?? (async () => {}),
  });
}

describe('SholatReminderTicker', () => {
  it('sends a reminder to each enabled chat at the prayer minute', async () => {
    const sender = new FakeSender();
    const ticker = makeTicker({
      cache: { today: makeToday() },
      chats: ['a@c.us', 'b@g.us'],
      sender,
    });

    await ticker.tick(dzuhurNow);

    expect(sender.sent.map((s) => s.chatId)).toEqual(['a@c.us', 'b@g.us']);
    expect(sender.sent[0].text).toContain('Dzuhur');
    expect(sender.sent[0].text).toContain('11:57');
  });

  it('does not send the same prayer twice within the day', async () => {
    const sender = new FakeSender();
    const ticker = makeTicker({ cache: { today: makeToday() }, chats: ['a@c.us'], sender });

    await ticker.tick(dzuhurNow);
    await ticker.tick(dzuhurNow);

    expect(sender.sent).toHaveLength(1);
  });

  it('does nothing when no prayer matches the current minute', async () => {
    const sender = new FakeSender();
    const ticker = makeTicker({ cache: { today: makeToday() }, chats: ['a@c.us'], sender });

    await ticker.tick(offPrayerNow);

    expect(sender.sent).toEqual([]);
  });

  it('does not send or warm when no chats are enabled', async () => {
    const sender = new FakeSender();
    let warmCalls = 0;
    const ticker = makeTicker({
      cache: { today: null },
      chats: [],
      sender,
      warmCache: async () => {
        warmCalls++;
      },
    });

    await ticker.tick(dzuhurNow);
    await flush();

    expect(sender.sent).toEqual([]);
    expect(warmCalls).toBe(0);
  });

  it('warms the cache on a miss, then delivers once it is warm', async () => {
    const sender = new FakeSender();
    const cache: { today: TodaySchedule | null } = { today: null };
    let warmCalls = 0;
    const ticker = makeTicker({
      cache,
      chats: ['a@c.us'],
      sender,
      warmCache: async () => {
        warmCalls++;
        cache.today = makeToday(); // a successful warm populates the cache
      },
    });

    await ticker.tick(dzuhurNow);
    await flush();
    expect(warmCalls).toBe(1);
    expect(sender.sent).toEqual([]); // first tick only warmed

    await ticker.tick(dzuhurNow);
    await flush();
    expect(sender.sent.map((s) => s.chatId)).toEqual(['a@c.us']); // now it delivers
    expect(warmCalls).toBe(1); // cache was warm, no extra warm
  });

  it('does not start a second warm while one is in flight', async () => {
    const sender = new FakeSender();
    let warmCalls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ticker = makeTicker({
      cache: { today: null },
      chats: ['a@c.us'],
      sender,
      warmCache: async () => {
        warmCalls++;
        await gate; // stays in flight until released
      },
    });

    await ticker.tick(dzuhurNow);
    await flush();
    expect(warmCalls).toBe(1);

    await ticker.tick(new Date('2026-06-17T04:58:00Z')); // a minute later, warm still running
    await flush();
    expect(warmCalls).toBe(1); // guarded by the in-flight flag

    release();
    await flush();
  });

  it('throttles repeated warms while the cache stays cold', async () => {
    const sender = new FakeSender();
    let warmCalls = 0;
    const ticker = makeTicker({
      cache: { today: null },
      chats: ['a@c.us'],
      sender,
      warmCache: async () => {
        warmCalls++; // a failed warm: leaves the cache cold
      },
    });

    // 08:00, 08:05, 08:16 GMT+7 (== 01:00, 01:05, 01:16 UTC), same day
    await ticker.tick(new Date('2026-06-17T01:00:00Z'));
    await flush();
    expect(warmCalls).toBe(1);

    await ticker.tick(new Date('2026-06-17T01:05:00Z')); // within 15 min → throttled
    await flush();
    expect(warmCalls).toBe(1);

    await ticker.tick(new Date('2026-06-17T01:16:00Z')); // past 15 min → retries
    await flush();
    expect(warmCalls).toBe(2);
  });
});

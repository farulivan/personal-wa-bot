import { getUserLocalTime } from '../../app/scheduler.js';
import { debug, error } from '../../logger.js';
import { formatPrayerReminder } from './sholatPresenter.js';
import { findDuePrayers } from './sholatPrayerTimes.js';
import type { MessageSenderPort } from '../../adapters/whatsapp/ports.js';
import type { SholatService, TodaySchedule } from './sholatService.js';
import type { SholatRepository } from './infra/sholatRepository.js';

const DEFAULT_INTERVAL_MS = 30000;

export type SholatReminderTickerDeps = {
  sholatService: Pick<SholatService, 'getCachedTodaySchedule'>;
  sholatRepository: Pick<SholatRepository, 'listEnabledReminderChats'>;
  senderPort: MessageSenderPort;
  timezoneOffsetMinutes: number;
};

export type SholatReminderSchedulerDeps = SholatReminderTickerDeps & {
  now?: () => Date;
  intervalMs?: number;
};

export type SholatReminderSchedulerHandle = { stop: () => void };

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Decides and delivers prayer-time reminders. Holds per-day state — today's cached schedule
 * and which prayers have already fired — so it can be driven tick-by-tick: directly in tests,
 * or on an interval via startSholatReminderScheduler. It only reads the cache; the daily
 * prefetch job owns all upstream fetching.
 */
export class SholatReminderTicker {
  private firedKeys = new Set<string>();
  private memo: { date: string; today: TodaySchedule } | null = null;

  constructor(private readonly deps: SholatReminderTickerDeps) {}

  async tick(now: Date): Promise<void> {
    const { hour, minute, dateString } = getUserLocalTime(this.deps.timezoneOffsetMinutes, now);

    const today = await this.loadToday(now, dateString);
    if (!today) return;

    const due = findDuePrayers(today.schedule, `${pad(hour)}:${pad(minute)}`);
    if (due.length === 0) return;

    const enabledChats = await this.deps.sholatRepository.listEnabledReminderChats();
    if (enabledChats.length === 0) return;

    for (const prayer of due) {
      const fireKey = `${prayer.key}:${dateString}`;
      if (this.firedKeys.has(fireKey)) continue;
      this.firedKeys.add(fireKey);

      const message = formatPrayerReminder(prayer.label, prayer.time, today.locationName);
      for (const chatId of enabledChats) {
        try {
          await this.deps.senderPort.sendMessage(chatId, message);
        } catch (err) {
          error({ err, chatId, prayer: prayer.key }, '🕌 Failed to send sholat reminder');
        }
      }
    }
  }

  private async loadToday(now: Date, dateString: string): Promise<TodaySchedule | null> {
    if (this.memo && this.memo.date === dateString) {
      return this.memo.today;
    }

    // New day (or first run): reset per-day dedup, then read from cache (never the API).
    this.firedKeys.clear();

    const today = await this.deps.sholatService.getCachedTodaySchedule(now);
    if (!today) {
      debug({ date: dateString }, '🕌 Sholat reminder tick: today not cached yet, skipping');
      return null;
    }

    this.memo = { date: dateString, today };
    return today;
  }
}

export function startSholatReminderScheduler(
  deps: SholatReminderSchedulerDeps
): SholatReminderSchedulerHandle {
  const ticker = new SholatReminderTicker(deps);
  const now = deps.now ?? (() => new Date());
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  let isRunning = false;

  const runTick = async (): Promise<void> => {
    if (isRunning) return;
    isRunning = true;
    try {
      await ticker.tick(now());
    } catch (err) {
      error({ err }, '🕌 Sholat reminder tick failed');
    } finally {
      isRunning = false;
    }
  };

  void runTick();
  const handle = setInterval(() => {
    void runTick();
  }, intervalMs);

  return { stop: () => clearInterval(handle) };
}

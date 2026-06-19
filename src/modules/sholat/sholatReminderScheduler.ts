import { getUserLocalTime } from '../../app/scheduler.js';
import { debug, error } from '../../logger.js';
import { formatPrayerReminder } from './sholatPresenter.js';
import { findDuePrayers } from './sholatPrayerTimes.js';
import type { MessageSenderPort } from '../../adapters/whatsapp/ports.js';
import type { SholatService, TodaySchedule } from './sholatService.js';
import type { SholatRepository } from './infra/sholatRepository.js';

const DEFAULT_INTERVAL_MS = 30000;
// When today's schedule isn't cached (e.g. after a mid-day restart) the ticker warms it, but
// must not hammer the upstream API: wait at least this long between warm attempts while cold.
const WARM_RETRY_THROTTLE_MS = 15 * 60 * 1000;

export type SholatReminderTickerDeps = {
  sholatService: Pick<SholatService, 'getCachedTodaySchedule'>;
  sholatRepository: Pick<SholatRepository, 'listEnabledReminderChats'>;
  senderPort: MessageSenderPort;
  timezoneOffsetMinutes: number;
  /** Warms today's schedule into the cache, with its own bounded retry. Called on a cache miss. */
  warmCache: () => Promise<void>;
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
 * Decides and delivers prayer-time reminders. Holds per-day state — today's cached schedule and
 * which prayers have already fired — so it can be driven tick-by-tick: directly in tests, or on
 * an interval via startSholatReminderScheduler.
 *
 * The schedule is read from the cache (cache-aside); on a miss the ticker kicks off a bounded,
 * throttled background warm rather than blocking the tick, so a restart at any time of day
 * recovers without hammering the API.
 */
export class SholatReminderTicker {
  private firedKeys = new Set<string>();
  private memo: { date: string; today: TodaySchedule } | null = null;
  private warmInFlight = false;
  private lastWarmAttempt: { date: string; at: number } | null = null;

  constructor(private readonly deps: SholatReminderTickerDeps) {}

  async tick(now: Date): Promise<void> {
    const { hour, minute, dateString } = getUserLocalTime(this.deps.timezoneOffsetMinutes, now);

    // Nobody opted in → nothing to send, and no reason to warm the cache.
    const enabledChats = await this.deps.sholatRepository.listEnabledReminderChats();
    if (enabledChats.length === 0) return;

    const today = await this.loadToday(now, dateString);
    if (!today) return;

    const due = findDuePrayers(today.schedule, `${pad(hour)}:${pad(minute)}`);
    if (due.length === 0) return;

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

    // New day (or first run): reset per-day dedup before (re)loading.
    this.firedKeys.clear();

    const today = await this.deps.sholatService.getCachedTodaySchedule(now);
    if (!today) {
      // Cache-aside: populate on miss in the background (bounded + throttled), deliver next tick.
      this.maybeWarm(now, dateString);
      debug({ date: dateString }, '🕌 Sholat reminder tick: today not cached, warming');
      return null;
    }

    this.memo = { date: dateString, today };
    return today;
  }

  private maybeWarm(now: Date, dateString: string): void {
    if (this.warmInFlight) return;

    const last = this.lastWarmAttempt;
    if (last && last.date === dateString && now.getTime() - last.at < WARM_RETRY_THROTTLE_MS) {
      return;
    }

    this.warmInFlight = true;
    this.lastWarmAttempt = { date: dateString, at: now.getTime() };
    void this.deps
      .warmCache()
      .catch((err) => error({ err }, '🕌 Sholat reminder cache warm failed'))
      .finally(() => {
        this.warmInFlight = false;
      });
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

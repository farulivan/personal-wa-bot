import type { SholatDailyScheduleRow } from './infra/sholatRepository.js';

export type FardhuPrayerKey = 'subuh' | 'dzuhur' | 'ashar' | 'maghrib' | 'isya';

/** The five obligatory prayers, in daily order. Terbit/Dhuha/Imsak are not reminded on. */
export const FARDHU_PRAYERS: ReadonlyArray<{ key: FardhuPrayerKey; label: string }> = [
  { key: 'subuh', label: 'Subuh' },
  { key: 'dzuhur', label: 'Dzuhur' },
  { key: 'ashar', label: 'Ashar' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isya', label: 'Isya' },
];

export type DuePrayer = { key: FardhuPrayerKey; label: string; time: string };

/**
 * Returns the fardhu prayers whose scheduled time equals `currentHHMM` ("HH:MM", 24h).
 * Usually 0 or 1; an array keeps it correct in the rare case two prayers share a minute.
 */
export function findDuePrayers(
  schedule: Pick<SholatDailyScheduleRow, FardhuPrayerKey>,
  currentHHMM: string
): DuePrayer[] {
  const due: DuePrayer[] = [];
  for (const prayer of FARDHU_PRAYERS) {
    const time = schedule[prayer.key];
    if (time === currentHHMM) {
      due.push({ key: prayer.key, label: prayer.label, time });
    }
  }
  return due;
}

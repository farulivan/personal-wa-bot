import { describe, it, expect } from 'vitest';
import {
  formatScheduleResponse,
  formatHelpMessage,
  formatAmbiguousLocationMessage,
  formatLocationSuggestionMessage,
  formatLocationNotFoundMessage,
  formatPersistErrorMessage,
  formatFetchErrorMessage,
  formatReminderEnabled,
  formatReminderDisabled,
  formatReminderStatus,
  formatReminderGroupNotAllowed,
  formatPrayerReminder,
} from './sholatPresenter.js';
import type { SholatDailyScheduleRow } from './infra/sholatRepository.js';

const schedule: SholatDailyScheduleRow = {
  locationId: 'loc-1',
  scheduleDate: '2026-06-17',
  timezone: 'Asia/Jakarta',
  displayDate: 'Rabu, 17 Juni 2026',
  imsak: '04:30',
  subuh: '04:40',
  terbit: '05:55',
  dhuha: '06:20',
  dzuhur: '11:55',
  ashar: '15:15',
  maghrib: '17:50',
  isya: '19:05',
};

describe('sholatPresenter', () => {
  describe('formatScheduleResponse', () => {
    it('shows the location, display date, and every prayer time against its label', () => {
      const text = formatScheduleResponse('KAB. BOGOR', schedule);

      expect(text).toContain('*KAB. BOGOR*');
      expect(text).toContain('Rabu, 17 Juni 2026');
      expect(text).toContain('• Imsak: 04:30');
      expect(text).toContain('• Subuh: 04:40');
      expect(text).toContain('• Terbit: 05:55');
      expect(text).toContain('• Dhuha: 06:20');
      expect(text).toContain('• Dzuhur: 11:55');
      expect(text).toContain('• Ashar: 15:15');
      expect(text).toContain('• Maghrib: 17:50');
      expect(text).toContain('• Isya: 19:05');
    });
  });

  describe('formatHelpMessage', () => {
    it('lists the commands and names the current default location', () => {
      const text = formatHelpMessage('KOTA BANDUNG');
      expect(text).toContain('#sholat');
      expect(text).toContain('Default lokasi saat ini: KOTA BANDUNG');
    });
  });

  describe('formatAmbiguousLocationMessage', () => {
    it('echoes the query and renders each candidate as a bullet', () => {
      const text = formatAmbiguousLocationMessage('band', [
        'KOTA BANDUNG',
        'KAB. BANDUNG',
        'KAB. BANDUNG BARAT',
      ]);
      expect(text).toContain('"band"');
      expect(text).toContain('• KOTA BANDUNG');
      expect(text).toContain('• KAB. BANDUNG');
      expect(text).toContain('• KAB. BANDUNG BARAT');
    });
  });

  describe('formatLocationNotFoundMessage', () => {
    it('echoes the unresolved query', () => {
      expect(formatLocationNotFoundMessage('atlantis')).toContain('"atlantis"');
    });
  });

  describe('formatPersistErrorMessage', () => {
    it('names the location that could not be saved', () => {
      expect(formatPersistErrorMessage('KAB. BOGOR')).toContain('KAB. BOGOR');
    });
  });

  describe('formatFetchErrorMessage', () => {
    it('asks the user to retry', () => {
      expect(formatFetchErrorMessage()).toContain('Coba lagi');
    });
  });

  describe('reminder toggle confirmations', () => {
    it('formatReminderEnabled confirms activation and points to the off command', () => {
      const text = formatReminderEnabled();
      expect(text).toContain('dinyalakan');
      expect(text).toContain('#sholat reminder off');
    });

    it('formatReminderDisabled confirms deactivation and points to the on command', () => {
      const text = formatReminderDisabled();
      expect(text).toContain('dimatikan');
      expect(text).toContain('#sholat reminder on');
    });

    it('formatReminderGroupNotAllowed explains the group-only restriction', () => {
      expect(formatReminderGroupNotAllowed()).toContain('grup utama');
    });
  });

  describe('formatReminderStatus', () => {
    it('reports the active state when enabled', () => {
      const text = formatReminderStatus(true);
      expect(text).toContain('*aktif*');
      expect(text).not.toContain('nonaktif');
    });

    it('reports the inactive state when disabled', () => {
      const text = formatReminderStatus(false);
      expect(text).toContain('*nonaktif*');
    });

    it('always shows both the on and off commands', () => {
      for (const text of [formatReminderStatus(true), formatReminderStatus(false)]) {
        expect(text).toContain('#sholat reminder on');
        expect(text).toContain('#sholat reminder off');
      }
    });
  });

  describe('formatPrayerReminder', () => {
    it('names the prayer, its time, and the location', () => {
      const text = formatPrayerReminder('Dzuhur', '11:55', 'KAB. BOGOR');
      expect(text).toContain('*Dzuhur*');
      expect(text).toContain('*KAB. BOGOR*');
      expect(text).toContain('11:55');
    });
  });
});

describe('formatLocationSuggestionMessage', () => {
  it('names the suggestion and gives a command that works', () => {
    const out = formatLocationSuggestionMessage('kabbandung', 'KAB. BANDUNG');
    expect(out).toContain('KAB. BANDUNG');
    expect(out).toContain('--location kab. bandung');
  });
});

describe('formatScheduleResponse — resolution notes', () => {
  const schedule = {
    imsak: '04:20',
    subuh: '04:30',
    terbit: '05:45',
    dhuha: '06:10',
    dzuhur: '11:55',
    ashar: '15:15',
    maghrib: '18:00',
    isya: '19:10',
  } as Parameters<typeof formatScheduleResponse>[1];

  it('is byte-identical to today when there is no note', () => {
    expect(formatScheduleResponse('KOTA BANDUNG', schedule)).toBe(
      formatScheduleResponse('KOTA BANDUNG', schedule, undefined)
    );
  });

  it('points at the regency twin when the city was chosen', () => {
    const out = formatScheduleResponse('KOTA BOGOR', schedule, {
      kind: 'city_with_regency_twin',
      regencyName: 'KAB. BOGOR',
    });
    expect(out).toContain('KAB. BOGOR');
    expect(out).toContain('--location kab. bogor');
  });

  it('says so when a bare name resolved to a regency', () => {
    const out = formatScheduleResponse('KAB. PIDIE', schedule, { kind: 'resolved_to_regency' });
    expect(out).toContain('kabupatennya');
  });
});

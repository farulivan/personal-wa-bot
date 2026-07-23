import { describe, it, expect } from 'vitest';
import {
  formatReminderMessage,
  formatQuranHelpMessage,
  formatReadLoggedResponse,
  formatMarkSection,
  formatHistoryList,
  formatStreakSection,
  formatListPageFooter,
  formatEmptyListMessage,
  formatListPageOverflowMessage,
  rankLeaderboardEntries,
  formatLeaderboardMessage,
  formatMonthlyQuranDigestMessage,
  formatUndoSuccess,
  formatUndoNoReads,
  formatUndoTooLate,
} from './quranPresenter.js';
import type { UserReminder } from './quranPresenter.js';
import { QURAN_UNDO_WINDOW_MS } from './quranService.js';
import type { QuranLeaderboardEntry } from './quranService.js';
import type { QuranDailyReadRow, QuranHistoryRow } from './infra/quranRepository.js';
import type { StreakInfo } from '../../shared/streaks.js';

const makeReminder = (
  phoneNumber: string | null,
  name: string,
  hasRead: boolean,
  currentStreak: number
): UserReminder => ({ phoneNumber, name, hasRead, currentStreak });

describe('formatReminderMessage', () => {
  it('empty reminders returns onboarding text and no mentions', () => {
    const result = formatReminderMessage([]);
    expect(result.text).toContain('Pengingat tilawah 22:00 🌙');
    expect(result.text).toContain('Belum ada data #quran di grup ini');
    expect(result.text).toContain('#quran read 1');
    expect(result.mentions).toEqual([]);
  });

  it('all readToday, no unread — praise text uses plain names, mentions empty', () => {
    const reminders = [
      makeReminder('628111111111', 'Ali', true, 5),
      makeReminder('628222222222', 'Budi', true, 3),
    ];
    const result = formatReminderMessage(reminders);
    expect(result.text).toContain('MasyaAllah tabarakallah');
    expect(result.text).toContain('Ali');
    expect(result.text).toContain('Budi');
    expect(result.text).not.toContain('@628111111111');
    expect(result.text).not.toContain('@628222222222');
    expect(result.mentions).toEqual([]);
  });

  it('only notReadWithStreak — text contains @phone tokens, mentions contains their JIDs', () => {
    const reminders = [
      makeReminder('628111111111', 'Ali', false, 5),
      makeReminder('628222222222', 'Budi', false, 3),
    ];
    const result = formatReminderMessage(reminders);
    expect(result.text).toContain('@628111111111');
    expect(result.text).toContain('@628222222222');
    expect(result.text).not.toContain('Ali');
    expect(result.text).not.toContain('Budi');
    expect(result.mentions).toEqual(['628111111111@c.us', '628222222222@c.us']);
  });

  it('only notReadNoStreak — text contains @phone tokens, mentions contains their JIDs', () => {
    const reminders = [
      makeReminder('628333333333', 'Cici', false, 0),
      makeReminder('628444444444', 'Dani', false, 0),
    ];
    const result = formatReminderMessage(reminders);
    expect(result.text).toContain('@628333333333');
    expect(result.text).toContain('@628444444444');
    expect(result.text).not.toContain('Cici');
    expect(result.text).not.toContain('Dani');
    expect(result.mentions).toEqual(['628333333333@c.us', '628444444444@c.us']);
  });

  it('mixed: readToday uses plain names, unread groups use mention tokens, mentions order is withStreak then noStreak', () => {
    const reminders = [
      makeReminder('628111111111', 'Ali', true, 7),
      makeReminder('628222222222', 'Budi', false, 4),
      makeReminder('628333333333', 'Cici', false, 0),
    ];
    const result = formatReminderMessage(reminders);
    expect(result.text).toContain('Ali');
    expect(result.text).not.toContain('@628111111111');
    expect(result.text).toContain('@628222222222');
    expect(result.text).toContain('@628333333333');
    expect(result.mentions).toEqual(['628222222222@c.us', '628333333333@c.us']);
  });

  it('mentions order: notReadWithStreak JIDs come before notReadNoStreak JIDs', () => {
    const reminders = [
      makeReminder('628555555555', 'Evan', false, 0),
      makeReminder('628666666666', 'Fara', false, 2),
    ];
    const result = formatReminderMessage(reminders);
    expect(result.mentions).toEqual(['628666666666@c.us', '628555555555@c.us']);
  });

  it('all-read branch: returns all-read message variant, mentions empty', () => {
    const reminders = [makeReminder('628111111111', 'Ali', true, 5)];
    const result = formatReminderMessage(reminders);
    expect(result.text).toContain('MasyaAllah tabarakallah');
    expect(result.text).toContain('Semoga Allah jaga istiqamah kita semua');
    expect(result.mentions).toEqual([]);
  });

  it('has-unread branch: returns reminder message variant', () => {
    const reminders = [makeReminder('628111111111', 'Ali', false, 3)];
    const result = formatReminderMessage(reminders);
    expect(result.text).toContain('Pengingat tilawah 22:00 🌙');
    expect(result.text).toContain('Gas baca dulu, lalu catat dengan #quran read');
  });

  it('unread user with null phoneNumber falls back to plain name in text, NOT in mentions', () => {
    const reminders = [makeReminder(null, 'Zain', false, 3)];
    const result = formatReminderMessage(reminders);
    expect(result.text).toContain('Zain');
    expect(result.text).not.toContain('@Zain');
    expect(result.mentions).toEqual([]);
  });

  it('mixed unread: one with phone gets @mention, one with null phone gets plain name', () => {
    const reminders = [
      makeReminder('628111111111', 'Ali', false, 4),
      makeReminder(null, 'Budi', false, 2),
    ];
    const result = formatReminderMessage(reminders);
    expect(result.text).toContain('@628111111111');
    expect(result.text).toContain('Budi');
    expect(result.text).not.toContain('@Budi');
    expect(result.mentions).toEqual(['628111111111@c.us']);
  });

  it('mixed unread noStreak: one with phone, one with null phone — only phone user in mentions', () => {
    const reminders = [
      makeReminder('628333333333', 'Cici', false, 0),
      makeReminder(null, 'Dani', false, 0),
    ];
    const result = formatReminderMessage(reminders);
    expect(result.text).toContain('@628333333333');
    expect(result.text).toContain('Dani');
    expect(result.text).not.toContain('@Dani');
    expect(result.mentions).toEqual(['628333333333@c.us']);
  });
});

const TZ = 420; // GMT+7

function lbEntry(
  user: string,
  currentStreak: number,
  bestStreak: number,
  pagesRead: number
): QuranLeaderboardEntry {
  return { user, currentStreak, bestStreak, pagesRead };
}

function readRow(overrides: Partial<QuranDailyReadRow> = {}): QuranDailyReadRow {
  return {
    id: 1,
    user: 'user-1',
    pages: 3,
    createdAtUtc: '2026-06-17T02:00:00.000Z',
    updatedAtUtc: '2026-06-17T02:00:00.000Z',
    markBefore: null,
    ...overrides,
  };
}

describe('quranPresenter', () => {
  describe('formatReadLoggedResponse', () => {
    it('shows the live streak line when a streak is running', () => {
      const text = formatReadLoggedResponse(3, 10, 5);
      expect(text).toContain('3 halaman');
      expect(text).toContain('Total tilawah hari ini: 10 halaman');
      expect(text).toContain('Streak kamu sekarang: 5 hari');
    });

    it('nudges the user to start a streak when there is none', () => {
      const text = formatReadLoggedResponse(1, 1, 0);
      expect(text).toContain('ayo bangun streak');
      expect(text).not.toContain('Streak kamu sekarang');
    });
  });

  describe('formatMarkSection', () => {
    it('explains that --no-mark left the mark untouched', () => {
      const text = formatMarkSection(3, true, 604, 100, null);
      expect(text).toContain('--no-mark');
    });

    it('asks the user to set an initial mark when none exists', () => {
      const text = formatMarkSection(3, false, 604, null, null);
      expect(text).toContain('belum punya mark awal');
      expect(text).toContain('#quran mark');
    });

    it('celebrates khatam and resets when the new mark passes the last page', () => {
      const text = formatMarkSection(5, false, 604, 602, 607);
      expect(text).toContain('melewati batas 604');
      expect(text).toContain('khatam');
      expect(text).toContain('reset jadi halaman 0');
    });

    it('reports the auto-shift from the old mark to the new one', () => {
      const text = formatMarkSection(3, false, 604, 100, 103);
      expect(text).toContain('*100*');
      expect(text).toContain('*103*');
      expect(text).toContain('+3 halaman');
    });
  });

  describe('formatHistoryList', () => {
    const now = new Date('2026-06-17T12:00:00.000Z'); // local 2026-06-17 19:00 at GMT+7

    it('labels rows as Today, Yesterday, or a YYYY/MM/DD date', () => {
      const rows: QuranHistoryRow[] = [
        { pages: 3, createdAtUtc: '2026-06-17T02:00:00.000Z' }, // today
        { pages: 5, createdAtUtc: '2026-06-16T02:00:00.000Z' }, // yesterday
        { pages: 2, createdAtUtc: '2026-06-10T02:00:00.000Z' }, // older
      ];
      const text = formatHistoryList(rows, TZ, now);
      expect(text).toContain('• Today — 3 halaman');
      expect(text).toContain('• Yesterday — 5 halaman');
      expect(text).toContain('• 2026/06/10 — 2 halaman');
    });
  });

  describe('formatStreakSection', () => {
    it('returns empty when there is neither a current nor a best streak', () => {
      const streaks: StreakInfo = { current: 0, best: 0, atRisk: false };
      expect(formatStreakSection(streaks)).toBe('');
    });

    it('shows the current streak without a Best part when best does not exceed it', () => {
      const text = formatStreakSection({ current: 3, best: 3, atRisk: false });
      expect(text).toContain('Streak: 3 hari');
      expect(text).not.toContain('Best:');
    });

    it('appends the Best part when the best streak exceeds the current one', () => {
      const text = formatStreakSection({ current: 3, best: 7, atRisk: false });
      expect(text).toContain('Streak: 3 hari');
      expect(text).toContain('Best: 7 hari');
    });
  });

  describe('formatListPageFooter', () => {
    it('is empty for a single page', () => {
      expect(formatListPageFooter(1, 1)).toBe('');
    });

    it('adds a next-page hint when more pages follow', () => {
      const footer = formatListPageFooter(1, 3);
      expect(footer).toContain('Halaman 1 dari 3');
      expect(footer).toContain('#quran list 2 untuk lanjut');
    });

    it('drops the next-page hint on the last page', () => {
      const footer = formatListPageFooter(3, 3);
      expect(footer).toContain('Halaman 3 dari 3');
      expect(footer).not.toContain('untuk lanjut');
    });
  });

  describe('formatListPageOverflowMessage', () => {
    it('suggests the last page number when there is more than one page', () => {
      expect(formatListPageOverflowMessage(5, 3)).toContain('Coba: #quran list 3');
    });

    it('suggests a bare list command when there is only one page', () => {
      const text = formatListPageOverflowMessage(2, 1);
      expect(text).toContain('Coba: #quran list');
      expect(text).not.toContain('list 1');
    });
  });

  describe('rankLeaderboardEntries', () => {
    it('ranks by current streak first', () => {
      const ranked = rankLeaderboardEntries([lbEntry('A', 1, 9, 9), lbEntry('B', 5, 1, 1)]);
      expect(ranked.map((e) => e.user)).toEqual(['B', 'A']);
    });

    it('breaks a current-streak tie by best streak', () => {
      const ranked = rankLeaderboardEntries([lbEntry('A', 3, 4, 9), lbEntry('B', 3, 8, 1)]);
      expect(ranked.map((e) => e.user)).toEqual(['B', 'A']);
    });

    it('breaks a streak tie by pages read', () => {
      const ranked = rankLeaderboardEntries([lbEntry('A', 3, 4, 10), lbEntry('B', 3, 4, 25)]);
      expect(ranked.map((e) => e.user)).toEqual(['B', 'A']);
    });

    it('breaks a full tie alphabetically by user', () => {
      const ranked = rankLeaderboardEntries([lbEntry('Zayd', 3, 4, 5), lbEntry('Adam', 3, 4, 5)]);
      expect(ranked.map((e) => e.user)).toEqual(['Adam', 'Zayd']);
    });

    it('caps the result at the limit and does not mutate the input', () => {
      const input = Array.from({ length: 12 }, (_, i) =>
        lbEntry(`U${String(i).padStart(2, '0')}`, i, 0, 0)
      );
      const snapshot = input.map((e) => e.user);
      const ranked = rankLeaderboardEntries(input);
      expect(ranked).toHaveLength(10);
      expect(rankLeaderboardEntries(input, 3)).toHaveLength(3);
      expect(input.map((e) => e.user)).toEqual(snapshot); // original order preserved
    });
  });

  describe('formatLeaderboardMessage', () => {
    it('shows a Ramadhan-flavoured empty state', () => {
      const text = formatLeaderboardMessage('ramadhan', []);
      expect(text).toContain('Ramadhan Leaderboard');
      expect(text).toContain('Belum ada data tilawah di periode ini');
    });

    it('shows a monthly empty state', () => {
      const text = formatLeaderboardMessage('monthly', []);
      expect(text).toContain('Leaderboard Tilawah Bulan Ini');
      expect(text).toContain('Belum ada data tilawah bulan ini');
    });

    it('medals the top three, falls back to 🌱, and shows Best only when it exceeds current', () => {
      const text = formatLeaderboardMessage('monthly', [
        lbEntry('A', 5, 5, 30),
        lbEntry('B', 4, 9, 20),
        lbEntry('C', 3, 3, 10),
        lbEntry('D', 2, 2, 5),
      ]);
      expect(text).toContain('🥇 A');
      expect(text).toContain('🥈 B');
      expect(text).toContain('🥉 C');
      expect(text).toContain('🌱 D');
      expect(text).toContain('(Best 9 hari)'); // B: best 9 > current 4
      expect(text).not.toContain('(Best 5 hari)'); // A: best == current
    });
  });

  describe('formatMonthlyQuranDigestMessage', () => {
    it('shows an empty recap when nothing was logged', () => {
      const text = formatMonthlyQuranDigestMessage([], 'June 2026');
      expect(text).toContain('Monthly Quran Recap — June 2026');
      expect(text).toContain('No reading was logged last month');
    });

    it('pluralises days and pages correctly', () => {
      const text = formatMonthlyQuranDigestMessage(
        [lbEntry('A', 1, 1, 1), lbEntry('B', 2, 5, 10)],
        'June 2026'
      );
      expect(text).toContain('🔥 Streak 1 day | 📖 1 page');
      expect(text).toContain('🔥 Streak 2 days (Best 5 days) | 📖 10 pages');
    });
  });

  describe('undo messages', () => {
    it('formatUndoSuccess echoes the date and cancelled pages', () => {
      const text = formatUndoSuccess(
        readRow({ updatedAtUtc: '2026-06-17T02:00:00.000Z', pages: 3 }),
        TZ
      );
      expect(text).toContain('dibatalkan');
      expect(text).toContain('2026-06-17');
      expect(text).toContain('3 halaman');
    });

    it('formatUndoTooLate states the undo window and the last entry', () => {
      const undoWindowMinutes = QURAN_UNDO_WINDOW_MS / 60_000;
      const text = formatUndoTooLate(
        readRow({ updatedAtUtc: '2026-06-17T02:00:00.000Z', pages: 3 }),
        TZ
      );
      expect(text).toContain(`${undoWindowMinutes} menit`);
      expect(text).toContain('[2026-06-17] 3 halaman');
    });

    it('formatUndoNoReads explains there is nothing to undo today', () => {
      expect(formatUndoNoReads()).toContain('Tidak ada catatan tilawah hari ini');
    });
  });

  describe('static messages', () => {
    it('formatQuranHelpMessage lists commands and the undo window', () => {
      const undoWindowMinutes = QURAN_UNDO_WINDOW_MS / 60_000;
      const text = formatQuranHelpMessage();
      expect(text).toContain('#quran read');
      expect(text).toContain('#quran leaderboard');
      expect(text).toContain(`${undoWindowMinutes} menit`);
    });

    it('formatEmptyListMessage tells the user how to start', () => {
      expect(formatEmptyListMessage()).toContain('#quran read 1');
    });
  });
});

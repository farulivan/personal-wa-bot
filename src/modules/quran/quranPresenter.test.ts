import { describe, it, expect } from 'vitest';
import { formatReminderMessage } from './quranPresenter.js';
import type { UserReminder } from './quranPresenter.js';

const makeReminder = (
  userId: string,
  name: string,
  hasRead: boolean,
  currentStreak: number
): UserReminder => ({ userId, name, hasRead, currentStreak });

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
      makeReminder('628111111111@c.us', 'Ali', true, 5),
      makeReminder('628222222222@c.us', 'Budi', true, 3),
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
      makeReminder('628111111111@c.us', 'Ali', false, 5),
      makeReminder('628222222222@c.us', 'Budi', false, 3),
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
      makeReminder('628333333333@c.us', 'Cici', false, 0),
      makeReminder('628444444444@c.us', 'Dani', false, 0),
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
      makeReminder('628111111111@c.us', 'Ali', true, 7),
      makeReminder('628222222222@c.us', 'Budi', false, 4),
      makeReminder('628333333333@c.us', 'Cici', false, 0),
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
      makeReminder('628555555555@c.us', 'Evan', false, 0),
      makeReminder('628666666666@c.us', 'Fara', false, 2),
    ];
    const result = formatReminderMessage(reminders);
    expect(result.mentions).toEqual(['628666666666@c.us', '628555555555@c.us']);
  });

  it('all-read branch: returns all-read message variant, mentions empty', () => {
    const reminders = [makeReminder('628111111111@c.us', 'Ali', true, 5)];
    const result = formatReminderMessage(reminders);
    expect(result.text).toContain('MasyaAllah tabarakallah');
    expect(result.text).toContain('Semoga Allah jaga istiqamah kita semua');
    expect(result.mentions).toEqual([]);
  });

  it('has-unread branch: returns reminder message variant', () => {
    const reminders = [makeReminder('628111111111@c.us', 'Ali', false, 3)];
    const result = formatReminderMessage(reminders);
    expect(result.text).toContain('Pengingat tilawah 22:00 🌙');
    expect(result.text).toContain('Gas baca dulu, lalu catat dengan #quran read');
  });
});

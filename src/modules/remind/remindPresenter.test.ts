import { describe, expect, it } from 'vitest';
import {
  formatSchedulerReminderMessage,
  toLocalDateTimeLabel,
  formatReminderCreated,
  formatReminderList,
  formatEmptyListMessage,
  formatListPageOverflowMessage,
  formatPastTimeMessage,
  formatActiveLimitMessage,
  formatUndoSuccess,
  formatUndoNoReminders,
  formatUndoTooLate,
  formatHelpMessage,
} from './remindPresenter.js';
import { REMIND_UNDO_WINDOW_MS } from './remindService.js';
import type { ReminderListRow } from './infra/remindRepository.js';

describe('formatSchedulerReminderMessage', () => {
  const phoneNumber = '6281234567890';
  const name = 'Alice';
  const reminderText = 'Submit the report';
  const localDateTimeLabel = '2026-05-06 10:30';

  it('group + phone present → text contains @phone token (not the name), mentions has the phone number', () => {
    const result = formatSchedulerReminderMessage(
      phoneNumber,
      name,
      reminderText,
      localDateTimeLabel,
      true
    );

    expect(result.text).toContain('@6281234567890');
    expect(result.text).not.toContain(name);
    expect(result.mentions).toEqual(['6281234567890']);
  });

  it('group + phone present → text contains the full reminder body and label', () => {
    const result = formatSchedulerReminderMessage(
      phoneNumber,
      name,
      reminderText,
      localDateTimeLabel,
      true
    );

    expect(result.text).toContain('Reminder for @6281234567890 ⏰');
    expect(result.text).toContain(`Schedule: ${localDateTimeLabel} (GMT+7)`);
    expect(result.text).toContain(reminderText);
    expect(result.text).toContain('Hope this helps you stay on track.');
  });

  it('group + phone null → falls back to plain name, mentions is empty', () => {
    const result = formatSchedulerReminderMessage(
      null,
      name,
      reminderText,
      localDateTimeLabel,
      true
    );

    expect(result.text).toContain(`Reminder for ${name} ⏰`);
    expect(result.text).not.toContain('@6281234567890');
    expect(result.mentions).toEqual([]);
  });

  it('DM → text contains the plain name (not a mention token), mentions is empty', () => {
    const result = formatSchedulerReminderMessage(
      phoneNumber,
      name,
      reminderText,
      localDateTimeLabel,
      false
    );

    expect(result.text).toContain(`Reminder for ${name} ⏰`);
    expect(result.text).not.toContain('@6281234567890');
    expect(result.mentions).toEqual([]);
  });

  it('DM → text contains the full reminder body and label', () => {
    const result = formatSchedulerReminderMessage(
      phoneNumber,
      name,
      reminderText,
      localDateTimeLabel,
      false
    );

    expect(result.text).toContain(`Schedule: ${localDateTimeLabel} (GMT+7)`);
    expect(result.text).toContain(reminderText);
    expect(result.text).toContain('Hope this helps you stay on track.');
  });
});

const TZ = 420; // GMT+7

function makeRow(overrides: Partial<ReminderListRow> = {}): ReminderListRow {
  return {
    id: 1,
    userId: 'user-1',
    targetChatId: 'chat-1',
    sourceType: 'direct',
    reminderText: 'Submit the report',
    scheduledAt: '2026-05-06T03:30:00.000Z',
    createdAt: '2026-05-06T03:00:00.000Z',
    sentAt: null,
    ...overrides,
  };
}

describe('toLocalDateTimeLabel', () => {
  it('shifts a UTC instant by the timezone offset and formats it', () => {
    // 03:30 UTC + 7h (420 min) = 10:30 local
    expect(toLocalDateTimeLabel('2026-05-06T03:30:00.000Z', TZ)).toBe('2026-05-06 10:30');
  });

  it('is an identity format at offset 0', () => {
    expect(toLocalDateTimeLabel('2026-05-06T10:30:00.000Z', 0)).toBe('2026-05-06 10:30');
  });

  it('rolls forward across midnight for a positive offset', () => {
    // 20:00 UTC + 7h = 03:00 the next day
    expect(toLocalDateTimeLabel('2026-05-06T20:00:00.000Z', TZ)).toBe('2026-05-07 03:00');
  });

  it('rolls back across midnight for a negative offset', () => {
    // 02:00 UTC - 5h (-300 min) = 21:00 the previous day
    expect(toLocalDateTimeLabel('2026-05-06T02:00:00.000Z', -300)).toBe('2026-05-05 21:00');
  });

  it('zero-pads month, day, hour, and minute', () => {
    expect(toLocalDateTimeLabel('2026-01-02T01:05:00.000Z', 0)).toBe('2026-01-02 01:05');
  });
});

describe('formatReminderCreated', () => {
  it('labels a group reminder as delivered to the group chat', () => {
    const text = formatReminderCreated('2026-05-06T03:30:00.000Z', TZ, 'Ship it', true);
    expect(text).toContain('this group chat');
    expect(text).toContain('2026-05-06 10:30 (GMT+7)');
    expect(text).toContain('Ship it');
  });

  it('labels a direct reminder as delivered to the direct chat', () => {
    const text = formatReminderCreated('2026-05-06T03:30:00.000Z', TZ, 'Ship it', false);
    expect(text).toContain('this direct chat');
    expect(text).not.toContain('this group chat');
  });
});

describe('formatReminderList', () => {
  const now = new Date('2026-05-06T12:00:00.000Z');

  it('marks a future, unsent reminder as Pending', () => {
    const text = formatReminderList(
      [makeRow({ scheduledAt: '2026-05-06T15:00:00.000Z', sentAt: null })],
      1,
      1,
      TZ,
      now
    );
    expect(text).toContain('[Pending]');
  });

  it('marks a past, unsent reminder as Due', () => {
    const text = formatReminderList(
      [makeRow({ scheduledAt: '2026-05-06T09:00:00.000Z', sentAt: null })],
      1,
      1,
      TZ,
      now
    );
    expect(text).toContain('[Due]');
  });

  it('treats a reminder scheduled exactly at now as Due (boundary)', () => {
    const text = formatReminderList(
      [makeRow({ scheduledAt: now.toISOString(), sentAt: null })],
      1,
      1,
      TZ,
      now
    );
    expect(text).toContain('[Due]');
  });

  it('marks a reminder with a sentAt timestamp as Sent, even if past due', () => {
    const text = formatReminderList(
      [makeRow({ scheduledAt: '2026-05-06T09:00:00.000Z', sentAt: '2026-05-06T09:00:05.000Z' })],
      1,
      1,
      TZ,
      now
    );
    expect(text).toContain('[Sent]');
    expect(text).not.toContain('[Due]');
  });

  it('labels the channel Group or Direct from sourceType', () => {
    const group = formatReminderList([makeRow({ sourceType: 'group' })], 1, 1, TZ, now);
    const direct = formatReminderList([makeRow({ sourceType: 'direct' })], 1, 1, TZ, now);
    expect(group).toContain('(Group)');
    expect(direct).toContain('(Direct)');
  });

  it('omits the pagination footer on a single page', () => {
    const text = formatReminderList([makeRow()], 1, 1, TZ, now);
    expect(text).not.toContain('📄');
  });

  it('shows a next-page hint when more pages follow', () => {
    const text = formatReminderList([makeRow()], 1, 3, TZ, now);
    expect(text).toContain('📄 Page 1 of 3');
    expect(text).toContain('#remind list 2 for next page');
  });

  it('drops the next-page hint on the last page', () => {
    const text = formatReminderList([makeRow()], 3, 3, TZ, now);
    expect(text).toContain('📄 Page 3 of 3');
    expect(text).not.toContain('for next page');
  });
});

describe('formatListPageOverflowMessage', () => {
  it('suggests the last page number when there is more than one page', () => {
    const text = formatListPageOverflowMessage(5, 3);
    expect(text).toContain('Last page is 3');
    expect(text).toContain('Try: #remind list 3');
  });

  it('suggests a bare list command when there is only one page', () => {
    const text = formatListPageOverflowMessage(2, 1);
    expect(text).toContain('Last page is 1');
    expect(text).toContain('Try: #remind list');
    expect(text).not.toContain('list 1');
  });
});

describe('formatActiveLimitMessage', () => {
  it('states the current active count and the ceiling', () => {
    const text = formatActiveLimitMessage(50);
    expect(text).toContain('50 active reminders');
    expect(text).toContain('max 50');
  });
});

describe('formatUndoSuccess', () => {
  it('confirms the undo and echoes the schedule and text', () => {
    const text = formatUndoSuccess(
      makeRow({ scheduledAt: '2026-05-06T03:30:00.000Z', reminderText: 'Call the vet' }),
      TZ
    );
    expect(text).toContain('Reminder undone');
    expect(text).toContain('2026-05-06 10:30 (GMT+7)');
    expect(text).toContain('Call the vet');
  });
});

describe('formatUndoTooLate', () => {
  it('explains the undo window and shows the last reminder', () => {
    const undoWindowMinutes = REMIND_UNDO_WINDOW_MS / 60_000;
    const text = formatUndoTooLate(
      makeRow({ scheduledAt: '2026-05-06T03:30:00.000Z', reminderText: 'Call the vet' }),
      TZ
    );
    expect(text).toContain(`${undoWindowMinutes} minutes`);
    expect(text).toContain('2026-05-06 10:30');
    expect(text).toContain('Call the vet');
  });
});

describe('static messages', () => {
  it('formatHelpMessage advertises the command and the undo window', () => {
    const undoWindowMinutes = REMIND_UNDO_WINDOW_MS / 60_000;
    const text = formatHelpMessage();
    expect(text).toContain('#remind');
    expect(text).toContain('list');
    expect(text).toContain('undo');
    expect(text).toContain(`${undoWindowMinutes} minutes`);
  });

  it('formatEmptyListMessage tells the user how to start', () => {
    expect(formatEmptyListMessage()).toContain('#remind');
  });

  it('formatPastTimeMessage explains the time must be in the future', () => {
    expect(formatPastTimeMessage().toLowerCase()).toContain('future');
  });

  it('formatUndoNoReminders states there is nothing to undo', () => {
    expect(formatUndoNoReminders().toLowerCase()).toContain('nothing to undo');
  });
});

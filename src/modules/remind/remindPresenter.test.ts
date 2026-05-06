import { describe, expect, it } from 'vitest';
import { formatSchedulerReminderMessage } from './remindPresenter.js';

describe('formatSchedulerReminderMessage', () => {
  const userId = '6281234567890@c.us';
  const name = 'Alice';
  const reminderText = 'Submit the report';
  const localDateTimeLabel = '2026-05-06 10:30';

  it('group chat — text contains @phone token (not the name), mentions contains userId', () => {
    const result = formatSchedulerReminderMessage(
      userId,
      name,
      reminderText,
      localDateTimeLabel,
      true
    );

    expect(result.text).toContain('@6281234567890');
    expect(result.text).not.toContain(name);
    expect(result.mentions).toEqual([userId]);
  });

  it('group chat — text contains the full reminder body and label', () => {
    const result = formatSchedulerReminderMessage(
      userId,
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

  it('DM — text contains the plain name (not a mention token), mentions is empty', () => {
    const result = formatSchedulerReminderMessage(
      userId,
      name,
      reminderText,
      localDateTimeLabel,
      false
    );

    expect(result.text).toContain(`Reminder for ${name} ⏰`);
    expect(result.text).not.toContain('@6281234567890');
    expect(result.mentions).toEqual([]);
  });

  it('DM — text contains the full reminder body and label', () => {
    const result = formatSchedulerReminderMessage(
      userId,
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

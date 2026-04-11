import { describe, it, expect } from 'vitest';
import {
  parseDateInput,
  parseTimeInput,
  parseReminderCommand,
  resolveDateInput,
  toScheduledUtcIso,
} from './remindParser.js';

describe('parseDateInput', () => {
  it('parses a valid date', () => {
    const result = parseDateInput('2026-03-10');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.year).toBe(2026);
      expect(result.value.month).toBe(3);
      expect(result.value.day).toBe(10);
      expect(result.value.normalized).toBe('2026-03-10');
    }
  });

  it('rejects invalid format', () => {
    expect(parseDateInput('10/03/2026').ok).toBe(false);
    expect(parseDateInput('2026-3-10').ok).toBe(false);
    expect(parseDateInput('').ok).toBe(false);
  });

  it('rejects impossible dates', () => {
    expect(parseDateInput('2026-02-30').ok).toBe(false);
    expect(parseDateInput('2026-13-01').ok).toBe(false);
  });
});

describe('parseTimeInput', () => {
  it('parses HH:MM format', () => {
    const result = parseTimeInput('10:30');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hour).toBe(10);
      expect(result.value.minute).toBe(30);
      expect(result.value.normalized).toBe('10:30');
    }
  });

  it('parses bare hour', () => {
    const result = parseTimeInput('9');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hour).toBe(9);
      expect(result.value.minute).toBe(0);
    }
  });

  it('parses 12-hour am format', () => {
    const result = parseTimeInput('9am');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.hour).toBe(9);
  });

  it('parses 12-hour pm format', () => {
    const result = parseTimeInput('9pm');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.hour).toBe(21);
  });

  it('parses 12:00pm as noon (12)', () => {
    const result = parseTimeInput('12pm');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.hour).toBe(12);
  });

  it('parses 12:00am as midnight (0)', () => {
    const result = parseTimeInput('12am');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.hour).toBe(0);
  });

  it('parses HH:MMpm', () => {
    const result = parseTimeInput('10:21pm');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hour).toBe(22);
      expect(result.value.minute).toBe(21);
    }
  });

  it('rejects invalid minutes', () => {
    expect(parseTimeInput('10:60').ok).toBe(false);
  });

  it('rejects hour out of 24h range', () => {
    expect(parseTimeInput('25').ok).toBe(false);
  });

  it('rejects invalid format', () => {
    expect(parseTimeInput('ten').ok).toBe(false);
  });
});

describe('parseReminderCommand', () => {
  it('parses a full reminder command', () => {
    const result = parseReminderCommand('#remind 2026-03-10 10:30 Buy milk');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dateInput).toBe('2026-03-10');
      expect(result.value.hour).toBe(10);
      expect(result.value.minute).toBe(30);
      expect(result.value.reminderText).toBe('Buy milk');
    }
  });

  it('parses with today/tomorrow as date', () => {
    const result = parseReminderCommand('#remind tomorrow 9am Team sync');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dateInput).toBe('tomorrow');
      expect(result.value.hour).toBe(9);
      expect(result.value.reminderText).toBe('Team sync');
    }
  });

  it('rejects missing message', () => {
    expect(parseReminderCommand('#remind 2026-03-10 10:30').ok).toBe(false);
  });

  it('rejects message over 200 chars', () => {
    const longText = 'a'.repeat(201);
    expect(parseReminderCommand(`#remind 2026-03-10 10:30 ${longText}`).ok).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(parseReminderCommand('#remind').ok).toBe(false);
    expect(parseReminderCommand('hello').ok).toBe(false);
  });
});

describe('resolveDateInput', () => {
  const TZ_UTC7 = 420;
  const now = new Date('2026-04-08T10:00:00Z'); // local = 2026-04-08 17:00 UTC+7

  it('resolves today', () => {
    const result = resolveDateInput('today', now, TZ_UTC7);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.normalized).toBe('2026-04-08');
  });

  it('resolves tomorrow', () => {
    const result = resolveDateInput('tomorrow', now, TZ_UTC7);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.normalized).toBe('2026-04-09');
  });

  it('falls through to parseDateInput for YYYY-MM-DD', () => {
    const result = resolveDateInput('2026-05-01', now, TZ_UTC7);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.normalized).toBe('2026-05-01');
  });

  it('is case-insensitive for today/tomorrow', () => {
    expect(resolveDateInput('TODAY', now, TZ_UTC7).ok).toBe(true);
    expect(resolveDateInput('Tomorrow', now, TZ_UTC7).ok).toBe(true);
  });
});

describe('toScheduledUtcIso', () => {
  it('converts local time to UTC ISO string', () => {
    // 2026-04-08 10:00 UTC+7 = 2026-04-08 03:00 UTC
    const result = toScheduledUtcIso(2026, 4, 8, 10, 0, 420);
    expect(result).toBe('2026-04-08T03:00:00.000Z');
  });

  it('handles midnight crossing', () => {
    // 2026-04-08 01:00 UTC+7 = 2026-04-07 18:00 UTC
    const result = toScheduledUtcIso(2026, 4, 8, 1, 0, 420);
    expect(result).toBe('2026-04-07T18:00:00.000Z');
  });
});

import { toPhoneNumber } from '../../shared/identity.js';
import type { PhoneNumber } from '../../shared/identity.js';
import { describe, it, expect } from 'vitest';
import {
  formatUndoSuccess,
  formatUndoNoLogs,
  formatUndoTooLate,
  formatDigestMessage,
  rankLeaderboardEntries,
  formatLeaderboardMessage,
  formatWorkoutList,
  formatLiftLogResponse,
  formatCardioLogResponse,
  formatStreakNote,
  formatStreakSection,
  formatListPageFooter,
  formatEmptyListMessage,
  formatPageOverflowMessage,
  formatMonthlyDigestMessage,
} from './workoutPresenter.js';
import { UNDO_WINDOW_MS } from './workoutService.js';
import type { WorkoutEntry } from './infra/workoutRepository.js';
import type { WorkoutLeaderboardEntry } from './workoutService.js';
import type { StreakInfo } from '../../shared/streaks.js';

function allMentionablePhones(entries: WorkoutLeaderboardEntry[]): Set<PhoneNumber> {
  return new Set(
    entries
      .map((e) => e.phoneNumber)
      .filter((p): p is string => p !== null)
      .map(toPhoneNumber)
  );
}

describe('formatUndoSuccess', () => {
  it('formats a lift entry with weight', () => {
    const entry: WorkoutEntry = {
      createdAt: '2026-04-08T10:00:00Z',
      workoutMode: 'lift',
      type: 'bench press',
      reps: 10,
      sets: 3,
      weight: 60,
    };
    const result = formatUndoSuccess(entry);
    expect(result).toContain('Undone');
    expect(result).toContain('[lift] bench press');
    expect(result).toContain('10 × 3 @ 60kg');
  });

  it('formats a bodyweight lift', () => {
    const entry: WorkoutEntry = {
      createdAt: '2026-04-08T10:00:00Z',
      workoutMode: 'lift',
      type: 'push up',
      reps: 20,
      sets: 4,
      weight: 0,
    };
    const result = formatUndoSuccess(entry);
    expect(result).toContain('bodyweight');
  });

  it('formats a cardio entry with distance', () => {
    const entry: WorkoutEntry = {
      createdAt: '2026-04-08T10:00:00Z',
      workoutMode: 'cardio',
      type: 'run',
      durationMinutes: 30,
      distanceKm: 5,
    };
    const result = formatUndoSuccess(entry);
    expect(result).toContain('Undone');
    expect(result).toContain('[cardio] run');
    expect(result).toContain('30min');
    expect(result).toContain('5km');
  });

  it('formats a cardio entry without distance', () => {
    const entry: WorkoutEntry = {
      createdAt: '2026-04-08T10:00:00Z',
      workoutMode: 'cardio',
      type: 'jump rope',
      durationMinutes: 15,
      distanceKm: 0,
    };
    const result = formatUndoSuccess(entry);
    expect(result).not.toContain('km');
  });
});

describe('formatUndoNoLogs', () => {
  it('returns appropriate message', () => {
    const result = formatUndoNoLogs();
    expect(result).toContain('Nothing to undo');
  });
});

describe('formatDigestMessage', () => {
  const makeEntry = (
    phoneNumber: string | null,
    user: string,
    sessionsInMonth: number,
    currentStreak: number,
    bestStreak: number,
    atRisk = false
  ): WorkoutLeaderboardEntry => ({
    phoneNumber,
    user,
    sessionsInMonth,
    currentStreak,
    bestStreak,
    atRisk,
  });

  const RULE_NOTE =
    '💡 Streak rule: one rest day is fine. Miss two days in a row and your streak resets.';

  it('returns morning header + empty leaderboard message when entries are empty', () => {
    const result = formatDigestMessage([], new Set());
    expect(result.text).toContain('Good morning team 👋');
    expect(result.text).toContain('Workout Leaderboard This Month 🏆');
    expect(result.text).toContain('No workouts logged this month');
    expect(result.text).toContain('#workout lift push up 20reps 4sets');
    expect(result.mentions).toEqual([]);
  });

  it('wraps the leaderboard body with morning header and closing line', () => {
    const entries = [
      makeEntry('628111111111', 'First', 10, 5, 5),
      makeEntry('628222222222', 'Second', 8, 3, 7),
      makeEntry('628333333333', 'Third', 6, 0, 0),
      makeEntry('628444444444', 'Fourth', 4, 0, 0),
    ];
    const result = formatDigestMessage(entries, allMentionablePhones(entries));
    expect(result.text.startsWith('Good morning team 👋')).toBe(true);
    expect(result.text).toContain('Workout Leaderboard This Month 🏆');
    expect(result.text).toContain('🥇 First');
    expect(result.text).toContain('🥈 Second');
    expect(result.text).toContain('🥉 Third');
    expect(result.text).toContain('🌱 Fourth');
    expect(result.text).toContain('🏋️ 10 sessions');
    expect(result.text).toContain('Keep showing up. Consistency wins. 💪');
    expect(result.mentions).toEqual([]);
  });

  it('places warning between Good morning header and leaderboard header when at least one user is at risk', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry('628222222222', 'Bob', 8, 3, 3, false),
    ];
    const result = formatDigestMessage(entries, allMentionablePhones(entries));
    expect(result.text).toContain('@628111111111');
    const morningIdx = result.text.indexOf('Good morning team 👋');
    const warningIdx = result.text.indexOf('@628111111111');
    const headerIdx = result.text.indexOf('Workout Leaderboard This Month 🏆');
    expect(morningIdx).toBeLessThan(warningIdx);
    expect(warningIdx).toBeLessThan(headerIdx);
  });

  it('at-risk warning uses @phone token derived from phoneNumber, not the display name', () => {
    const entries = [makeEntry('628111111111', 'Alice', 10, 5, 5, true)];
    const result = formatDigestMessage(entries, allMentionablePhones(entries));
    expect(result.text).toContain('@628111111111');
    expect(result.text).not.toContain('@Alice');
  });

  it('mentions array contains exactly the at-risk phone numbers in input order', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry('628222222222', 'Bob', 8, 3, 3, true),
      makeEntry('628333333333', 'Carol', 6, 0, 0, false),
    ];
    const result = formatDigestMessage(entries, allMentionablePhones(entries));
    expect(result.mentions).toEqual(['628111111111', '628222222222']);
  });

  it('mentions is empty when no at-risk users', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, false),
      makeEntry('628222222222', 'Bob', 8, 3, 3, false),
    ];
    const result = formatDigestMessage(entries, allMentionablePhones(entries));
    expect(result.mentions).toEqual([]);
  });

  it('at-risk user with null phoneNumber falls back to plain display name in text, not in mentions', () => {
    const entries = [makeEntry(null, 'Alice', 10, 5, 5, true)];
    const result = formatDigestMessage(entries, allMentionablePhones(entries));
    expect(result.text).toContain('Alice');
    expect(result.text).not.toContain('@');
    expect(result.mentions).toEqual([]);
  });

  it('mixed at-risk: user with phone gets @mention, user with null phone gets plain name', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry(null, 'Bob', 8, 3, 3, true),
      makeEntry('628333333333', 'Carol', 6, 0, 0, false),
    ];
    const result = formatDigestMessage(entries, allMentionablePhones(entries));
    expect(result.text).toContain('@628111111111');
    expect(result.text).toContain('Bob');
    expect(result.text).not.toContain('@Bob');
    expect(result.mentions).toEqual(['628111111111']);
  });

  it('omits @mentions for at-risk users whose phone is not in mentionablePhoneNumbers; keeps them in text by display name', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry('628222222222', 'Bob', 8, 3, 3, true),
    ];
    const onlyAlice = new Set([toPhoneNumber(entries[0].phoneNumber!)]);
    const result = formatDigestMessage(entries, onlyAlice);
    expect(result.text).toContain('@628111111111');
    expect(result.text).toContain('Bob');
    expect(result.text).not.toContain('@628222222222');
    expect(result.mentions).toEqual(['628111111111']);
  });

  it('produces no @mentions when mentionablePhoneNumbers is empty (e.g. membership lookup failed); names still appear', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry('628222222222', 'Bob', 8, 3, 3, true),
    ];
    const result = formatDigestMessage(entries, new Set());
    expect(result.text).toContain('Heads up Alice, Bob');
    expect(result.text).not.toContain('@628111111111');
    expect(result.text).not.toContain('@628222222222');
    expect(result.mentions).toEqual([]);
  });

  it('rule explainer sits immediately above Keep showing up line', () => {
    const entries = [makeEntry('628111111111', 'Alice', 10, 5, 5, false)];
    const result = formatDigestMessage(entries, allMentionablePhones(entries));
    const noteIdx = result.text.indexOf(RULE_NOTE);
    const closingIdx = result.text.indexOf('Keep showing up. Consistency wins. 💪');
    expect(noteIdx).toBeGreaterThan(-1);
    expect(closingIdx).toBeGreaterThan(-1);
    expect(result.text.slice(noteIdx + RULE_NOTE.length)).toBe(
      '\n\nKeep showing up. Consistency wins. 💪'
    );
  });

  it('rule explainer is present in the empty-leaderboard branch', () => {
    const result = formatDigestMessage([], new Set());
    expect(result.text).toContain(RULE_NOTE);
  });
});

describe('formatUndoTooLate', () => {
  it('shows time limit message for lift', () => {
    const entry: WorkoutEntry = {
      createdAt: '2026-04-08T10:00:00Z',
      workoutMode: 'lift',
      type: 'bench press',
      reps: 10,
      sets: 3,
      weight: 60,
    };
    const result = formatUndoTooLate(entry);
    expect(result).toContain(`${UNDO_WINDOW_MS / 60_000} minutes`);
    expect(result).toContain('[lift] bench press');
    expect(result).toContain('10 × 3 @ 60kg');
  });

  it('shows time limit message for cardio', () => {
    const entry: WorkoutEntry = {
      createdAt: '2026-04-08T10:00:00Z',
      workoutMode: 'cardio',
      type: 'run',
      durationMinutes: 30,
      distanceKm: 5,
    };
    const result = formatUndoTooLate(entry);
    expect(result).toContain(`${UNDO_WINDOW_MS / 60_000} minutes`);
    expect(result).toContain('[cardio] run');
    expect(result).toContain('30min');
  });
});

describe('rankLeaderboardEntries', () => {
  const makeEntry = (
    user: string,
    sessionsInMonth: number,
    currentStreak: number,
    bestStreak: number
  ): WorkoutLeaderboardEntry => ({
    phoneNumber: '628000000000',
    user,
    sessionsInMonth,
    currentStreak,
    bestStreak,
    atRisk: false,
  });

  it('sorts by sessionsInMonth descending as primary criterion', () => {
    const entries = [makeEntry('B', 5, 0, 0), makeEntry('A', 10, 0, 0), makeEntry('C', 3, 0, 0)];
    const ranked = rankLeaderboardEntries(entries);
    expect(ranked[0].user).toBe('A');
    expect(ranked[1].user).toBe('B');
    expect(ranked[2].user).toBe('C');
  });

  it('tiebreaks by currentStreak descending when sessions are equal', () => {
    const entries = [makeEntry('Low', 10, 2, 5), makeEntry('High', 10, 7, 5)];
    const ranked = rankLeaderboardEntries(entries);
    expect(ranked[0].user).toBe('High');
    expect(ranked[1].user).toBe('Low');
  });

  it('tiebreaks by bestStreak descending when sessions + currentStreak are equal', () => {
    const entries = [makeEntry('Low', 10, 3, 4), makeEntry('High', 10, 3, 9)];
    const ranked = rankLeaderboardEntries(entries);
    expect(ranked[0].user).toBe('High');
    expect(ranked[1].user).toBe('Low');
  });

  it('tiebreaks by name ascending (localeCompare) when all numeric metrics are equal', () => {
    const entries = [
      makeEntry('Zara', 5, 2, 8),
      makeEntry('Alice', 5, 2, 8),
      makeEntry('Mike', 5, 2, 8),
    ];
    const ranked = rankLeaderboardEntries(entries);
    expect(ranked[0].user).toBe('Alice');
    expect(ranked[1].user).toBe('Mike');
    expect(ranked[2].user).toBe('Zara');
  });

  it('caps result to 10 entries by default when given 12 entries', () => {
    const entries = Array.from({ length: 12 }, (_, i) => makeEntry(`User${i}`, 10 - i, 0, 0));
    const ranked = rankLeaderboardEntries(entries);
    expect(ranked).toHaveLength(10);
  });
});

describe('formatLeaderboardMessage', () => {
  const makeEntry = (
    phoneNumber: string | null,
    user: string,
    sessionsInMonth: number,
    currentStreak: number,
    bestStreak: number,
    atRisk = false
  ): WorkoutLeaderboardEntry => ({
    phoneNumber,
    user,
    sessionsInMonth,
    currentStreak,
    bestStreak,
    atRisk,
  });

  const RULE_NOTE =
    '💡 Streak rule: one rest day is fine. Miss two days in a row and your streak resets.';

  it('returns empty-state message with CTA when entries array is empty', () => {
    const result = formatLeaderboardMessage([], new Set());
    expect(result.text).toContain('#workout lift push up 20reps 4sets');
    expect(result.text).toContain('No workouts logged this month');
    expect(result.mentions).toEqual([]);
  });

  it('assigns medal prefixes to top 3 and 🌱 to 4th+', () => {
    const entries = [
      makeEntry('628111111111', 'First', 10, 0, 0),
      makeEntry('628222222222', 'Second', 8, 0, 0),
      makeEntry('628333333333', 'Third', 6, 0, 0),
      makeEntry('628444444444', 'Fourth', 4, 0, 0),
    ];
    const result = formatLeaderboardMessage(entries, allMentionablePhones(entries));
    expect(result.text).toContain('🥇 First');
    expect(result.text).toContain('🥈 Second');
    expect(result.text).toContain('🥉 Third');
    expect(result.text).toContain('🌱 Fourth');
  });

  it('omits streak section when both currentStreak and bestStreak are 0', () => {
    const entries = [makeEntry('628111111111', 'Budi', 4, 0, 0)];
    const result = formatLeaderboardMessage(entries, allMentionablePhones(entries));
    expect(result.text).toContain('4 sessions');
    expect(result.text).not.toContain('🔥 Streak');
    expect(result.text).not.toContain('🔥');
  });

  it('appends (Best Y days) only when bestStreak > currentStreak', () => {
    const withBest = [makeEntry('628111111111', 'Farul', 24, 5, 8)];
    const resultWithBest = formatLeaderboardMessage(withBest, allMentionablePhones(withBest));
    expect(resultWithBest.text).toContain('(Best 8 days)');

    const equalStreak = [makeEntry('628222222222', 'Ari', 18, 5, 5)];
    const resultEqual = formatLeaderboardMessage(equalStreak, allMentionablePhones(equalStreak));
    expect(resultEqual.text).not.toContain('Best');
  });

  it('shows at-risk warning before the header when one user is at risk', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry('628222222222', 'Bob', 8, 3, 3, false),
    ];
    const result = formatLeaderboardMessage(entries, allMentionablePhones(entries));
    expect(result.text).toContain('@628111111111');
    expect(result.text).toContain('workout today or your streak ends tomorrow');
    const warningIdx = result.text.indexOf('@628111111111');
    const headerIdx = result.text.indexOf('Workout Leaderboard This Month 🏆');
    expect(warningIdx).toBeLessThan(headerIdx);
  });

  it('at-risk warning uses @phone token derived from phoneNumber, not the display name', () => {
    const entries = [makeEntry('628111111111', 'Alice', 10, 5, 5, true)];
    const result = formatLeaderboardMessage(entries, allMentionablePhones(entries));
    expect(result.text).toContain('@628111111111');
    expect(result.text).not.toContain('@Alice');
  });

  it('tags multiple at-risk users comma-joined in a single warning line', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry('628222222222', 'Bob', 8, 3, 3, true),
      makeEntry('628333333333', 'Carol', 6, 0, 0, false),
    ];
    const result = formatLeaderboardMessage(entries, allMentionablePhones(entries));
    expect(result.text).toContain('@628111111111, @628222222222');
  });

  it('mentions array contains exactly the at-risk phone numbers in input order', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry('628222222222', 'Bob', 8, 3, 3, true),
      makeEntry('628333333333', 'Carol', 6, 0, 0, false),
    ];
    const result = formatLeaderboardMessage(entries, allMentionablePhones(entries));
    expect(result.mentions).toEqual(['628111111111', '628222222222']);
  });

  it('omits warning when no entries are at risk', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, false),
      makeEntry('628222222222', 'Bob', 8, 3, 3, false),
    ];
    const result = formatLeaderboardMessage(entries, allMentionablePhones(entries));
    expect(result.text).not.toContain('workout today or your streak ends tomorrow');
    expect(result.mentions).toEqual([]);
  });

  it('at-risk user with null phoneNumber falls back to plain display name in text, not in mentions', () => {
    const entries = [makeEntry(null, 'Alice', 10, 5, 5, true)];
    const result = formatLeaderboardMessage(entries, allMentionablePhones(entries));
    expect(result.text).toContain('Alice');
    expect(result.text).not.toContain('@Alice');
    expect(result.mentions).toEqual([]);
  });

  it('mixed at-risk: user with phone gets @mention, user with null phone gets plain name', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry(null, 'Bob', 8, 3, 3, true),
    ];
    const result = formatLeaderboardMessage(entries, allMentionablePhones(entries));
    expect(result.text).toContain('@628111111111');
    expect(result.text).toContain('Bob');
    expect(result.text).not.toContain('@Bob');
    expect(result.mentions).toEqual(['628111111111']);
  });

  it('only @mentions at-risk users whose phone is in mentionablePhoneNumbers (group with non-member at-risk)', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry('628222222222', 'Bob', 8, 3, 3, true),
    ];
    const onlyAlice = new Set([toPhoneNumber(entries[0].phoneNumber!)]);
    const result = formatLeaderboardMessage(entries, onlyAlice);
    expect(result.text).toContain('@628111111111');
    expect(result.text).toContain('Bob');
    expect(result.text).not.toContain('@628222222222');
    expect(result.mentions).toEqual(['628111111111']);
  });

  it('produces no @mentions when mentionablePhoneNumbers is empty (DM equivalent); names still appear', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry('628222222222', 'Bob', 8, 3, 3, true),
    ];
    const result = formatLeaderboardMessage(entries, new Set());
    expect(result.text).toContain('Heads up Alice, Bob');
    expect(result.text).not.toContain('@628111111111');
    expect(result.text).not.toContain('@628222222222');
    expect(result.mentions).toEqual([]);
  });

  it('rule explainer is the last line in the at-risk case', () => {
    const entries = [makeEntry('628111111111', 'Alice', 10, 5, 5, true)];
    const result = formatLeaderboardMessage(entries, allMentionablePhones(entries));
    expect(result.text.endsWith(RULE_NOTE)).toBe(true);
  });

  it('rule explainer is the last line in the not-at-risk case', () => {
    const entries = [makeEntry('628111111111', 'Alice', 10, 5, 5, false)];
    const result = formatLeaderboardMessage(entries, allMentionablePhones(entries));
    expect(result.text.endsWith(RULE_NOTE)).toBe(true);
  });

  it('rule explainer is present in the empty-leaderboard branch', () => {
    const result = formatLeaderboardMessage([], new Set());
    expect(result.text).toContain(RULE_NOTE);
  });
});

const TZ = 420; // GMT+7

function wlEntry(
  user: string,
  sessionsInMonth: number,
  currentStreak: number,
  bestStreak: number
): WorkoutLeaderboardEntry {
  return { phoneNumber: null, user, sessionsInMonth, currentStreak, bestStreak, atRisk: false };
}

describe('formatWorkoutList', () => {
  const now = new Date('2026-06-17T12:00:00.000Z'); // local 2026-06-17 at GMT+7

  it('labels rows as Today, Yesterday, or a YYYY/MM/DD date', () => {
    const rows: WorkoutEntry[] = [
      {
        createdAt: '2026-06-17T02:00:00.000Z',
        workoutMode: 'lift',
        type: 'bench',
        reps: 5,
        sets: 5,
        weight: 40,
      },
      {
        createdAt: '2026-06-16T02:00:00.000Z',
        workoutMode: 'lift',
        type: 'squat',
        reps: 5,
        sets: 5,
        weight: 60,
      },
      {
        createdAt: '2026-06-10T02:00:00.000Z',
        workoutMode: 'lift',
        type: 'deadlift',
        reps: 3,
        sets: 3,
        weight: 100,
      },
    ];
    const text = formatWorkoutList(rows, TZ, now);
    expect(text).toContain('Today');
    expect(text).toContain('Yesterday');
    expect(text).toContain('2026/06/10');
  });

  it('formats a weighted lift with reps × sets @ weight', () => {
    const rows: WorkoutEntry[] = [
      {
        createdAt: '2026-06-17T02:00:00.000Z',
        workoutMode: 'lift',
        type: 'bench press',
        reps: 10,
        sets: 3,
        weight: 60,
      },
    ];
    expect(formatWorkoutList(rows, TZ, now)).toContain('[lift] bench press | 10 × 3 @ 60kg');
  });

  it('renders a zero-weight lift as bodyweight', () => {
    const rows: WorkoutEntry[] = [
      {
        createdAt: '2026-06-17T02:00:00.000Z',
        workoutMode: 'lift',
        type: 'push up',
        reps: 20,
        sets: 4,
        weight: 0,
      },
    ];
    expect(formatWorkoutList(rows, TZ, now)).toContain('@ bodyweight');
  });

  it('formats cardio with an integer duration and distance', () => {
    const rows: WorkoutEntry[] = [
      {
        createdAt: '2026-06-17T02:00:00.000Z',
        workoutMode: 'cardio',
        type: 'run',
        durationMinutes: 30,
        distanceKm: 5,
      },
    ];
    expect(formatWorkoutList(rows, TZ, now)).toContain('[cardio] run | 30min | 5km');
  });

  it('formats cardio with a fractional duration and omits distance when zero', () => {
    const rows: WorkoutEntry[] = [
      {
        createdAt: '2026-06-17T02:00:00.000Z',
        workoutMode: 'cardio',
        type: 'row',
        durationMinutes: 30.5,
        distanceKm: 0,
      },
    ];
    const text = formatWorkoutList(rows, TZ, now);
    expect(text).toContain('30.5min');
    expect(text).not.toContain('km');
  });
});

describe('formatLiftLogResponse', () => {
  // now chosen so that now + 7h lands in each part-of-day window.
  const at = (utc: string) => new Date(utc);

  it('greets an early-morning session', () => {
    const text = formatLiftLogResponse(
      'bench press',
      10,
      3,
      60,
      TZ,
      at('2026-06-17T01:00:00.000Z')
    ); // 08:00
    expect(text).toContain('bench press');
    expect(text).toContain('10 × 3 @ 60kg');
    expect(text).toContain('Early grind');
  });

  it('greets a midday session', () => {
    const text = formatLiftLogResponse('squat', 5, 5, 80, TZ, at('2026-06-17T06:00:00.000Z')); // 13:00
    expect(text).toContain('Midday work');
  });

  it('greets an evening session', () => {
    const text = formatLiftLogResponse('deadlift', 3, 3, 100, TZ, at('2026-06-17T11:00:00.000Z')); // 18:00
    expect(text).toContain('After-hours effort');
  });

  it('greets a late-night session', () => {
    const text = formatLiftLogResponse('curl', 12, 3, 15, TZ, at('2026-06-17T16:00:00.000Z')); // 23:00
    expect(text).toContain('Late session');
  });

  it('renders zero weight as bodyweight', () => {
    const text = formatLiftLogResponse('pull up', 8, 3, 0, TZ, at('2026-06-17T01:00:00.000Z'));
    expect(text).toContain('8 × 3 @ bodyweight');
  });
});

describe('formatCardioLogResponse', () => {
  const at = (utc: string) => new Date(utc);

  it('greets each part of the day with its own line', () => {
    expect(formatCardioLogResponse('run', 30, 5, TZ, at('2026-06-17T01:00:00.000Z'))).toContain(
      'Strong start'
    );
    expect(formatCardioLogResponse('run', 30, 5, TZ, at('2026-06-17T06:00:00.000Z'))).toContain(
      'Midday momentum'
    );
    expect(formatCardioLogResponse('run', 30, 5, TZ, at('2026-06-17T11:00:00.000Z'))).toContain(
      'Evening push'
    );
    expect(formatCardioLogResponse('run', 30, 5, TZ, at('2026-06-17T16:00:00.000Z'))).toContain(
      'Late grind'
    );
  });

  it('includes distance when present and omits it when zero', () => {
    const withDistance = formatCardioLogResponse('run', 30, 5, TZ, at('2026-06-17T01:00:00.000Z'));
    expect(withDistance).toContain('30min | 5km');

    const noDistance = formatCardioLogResponse('yoga', 45, 0, TZ, at('2026-06-17T01:00:00.000Z'));
    expect(noDistance).toContain('45min');
    expect(noDistance).not.toContain('km');
  });
});

describe('formatStreakNote', () => {
  it('counts how many more workouts are needed today', () => {
    expect(formatStreakNote(1, 3, null)).toContain('2 more to go today');
  });

  it('confirms the day when the quota is just met, with a singular day', () => {
    const streaks: StreakInfo = { current: 1, best: 1, atRisk: false };
    expect(formatStreakNote(3, 3, streaks)).toContain('Day counted! Streak: 1 day');
  });

  it('pluralises the streak day count', () => {
    const streaks: StreakInfo = { current: 5, best: 5, atRisk: false };
    expect(formatStreakNote(3, 3, streaks)).toContain('Streak: 5 days');
  });

  it('acknowledges an already-locked-in day when the quota was passed', () => {
    expect(formatStreakNote(5, 3, { current: 4, best: 4, atRisk: false })).toContain(
      'Already locked in today'
    );
  });

  it('falls back to locked-in when the quota is met but no streak info is given', () => {
    expect(formatStreakNote(3, 3, null)).toContain('Already locked in today');
  });
});

describe('formatStreakSection', () => {
  it('is empty when there is neither a current nor best streak', () => {
    expect(formatStreakSection({ current: 0, best: 0, atRisk: false })).toBe('');
  });

  it('shows a singular day and no Best part when best does not exceed current', () => {
    const text = formatStreakSection({ current: 1, best: 1, atRisk: false });
    expect(text).toContain('Streak: 1 day');
    expect(text).not.toContain('Best:');
  });

  it('appends the Best part when best exceeds current', () => {
    const text = formatStreakSection({ current: 2, best: 7, atRisk: false });
    expect(text).toContain('Streak: 2 days');
    expect(text).toContain('Best: 7 days');
  });
});

describe('formatListPageFooter', () => {
  it('is empty for a single page', () => {
    expect(formatListPageFooter(1, 1)).toBe('');
  });

  it('adds a next-page hint when more pages follow', () => {
    const footer = formatListPageFooter(1, 3);
    expect(footer).toContain('Page 1 of 3');
    expect(footer).toContain('#workout list 2 for next');
  });

  it('drops the next-page hint on the last page', () => {
    const footer = formatListPageFooter(3, 3);
    expect(footer).toContain('Page 3 of 3');
    expect(footer).not.toContain('for next');
  });
});

describe('formatPageOverflowMessage', () => {
  it('suggests the last page number when there is more than one page', () => {
    expect(formatPageOverflowMessage(5, 3)).toContain('Try: #workout list 3');
  });

  it('suggests a bare list command when there is only one page', () => {
    const text = formatPageOverflowMessage(2, 1);
    expect(text).toContain('Try: #workout list');
    expect(text).not.toContain('list 1');
  });
});

describe('formatEmptyListMessage', () => {
  it('shows both a lift and a cardio starter example', () => {
    const text = formatEmptyListMessage();
    expect(text).toContain('#workout lift');
    expect(text).toContain('#workout cardio');
  });
});

describe('formatMonthlyDigestMessage', () => {
  it('shows an empty recap when nothing was logged', () => {
    const text = formatMonthlyDigestMessage([], 'June 2026');
    expect(text).toContain('Monthly Workout Recap — June 2026');
    expect(text).toContain('No workouts were logged last month');
  });

  it('medals ranked entries and pluralises sessions and streaks', () => {
    const text = formatMonthlyDigestMessage(
      [wlEntry('A', 1, 0, 0), wlEntry('B', 5, 2, 7)],
      'June 2026'
    );
    expect(text).toContain('🥇 A');
    expect(text).toContain('🏋️ 1 session');
    expect(text).toContain('🥈 B');
    expect(text).toContain('🏋️ 5 sessions | 🔥 Streak 2 days (Best 7 days)');
  });
});

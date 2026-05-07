import { describe, it, expect } from 'vitest';
import {
  formatUndoSuccess,
  formatUndoNoLogs,
  formatUndoTooLate,
  formatDigestMessage,
  rankLeaderboardEntries,
  formatLeaderboardMessage,
} from './workoutPresenter.js';
import { UNDO_WINDOW_MS } from './workoutService.js';
import type { WorkoutEntry } from './infra/workoutRepository.js';
import type { WorkoutLeaderboardEntry } from './workoutService.js';

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
    const result = formatDigestMessage([]);
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
    const result = formatDigestMessage(entries);
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
    const result = formatDigestMessage(entries);
    expect(result.text).toContain('@628111111111');
    const morningIdx = result.text.indexOf('Good morning team 👋');
    const warningIdx = result.text.indexOf('@628111111111');
    const headerIdx = result.text.indexOf('Workout Leaderboard This Month 🏆');
    expect(morningIdx).toBeLessThan(warningIdx);
    expect(warningIdx).toBeLessThan(headerIdx);
  });

  it('at-risk warning uses @phone token derived from phoneNumber, not the display name', () => {
    const entries = [makeEntry('628111111111', 'Alice', 10, 5, 5, true)];
    const result = formatDigestMessage(entries);
    expect(result.text).toContain('@628111111111');
    expect(result.text).not.toContain('@Alice');
  });

  it('mentions array contains exactly the at-risk users JIDs in input order', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry('628222222222', 'Bob', 8, 3, 3, true),
      makeEntry('628333333333', 'Carol', 6, 0, 0, false),
    ];
    const result = formatDigestMessage(entries);
    expect(result.mentions).toEqual(['628111111111@c.us', '628222222222@c.us']);
  });

  it('mentions is empty when no at-risk users', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, false),
      makeEntry('628222222222', 'Bob', 8, 3, 3, false),
    ];
    const result = formatDigestMessage(entries);
    expect(result.mentions).toEqual([]);
  });

  it('at-risk user with null phoneNumber falls back to plain display name in text, not in mentions', () => {
    const entries = [makeEntry(null, 'Alice', 10, 5, 5, true)];
    const result = formatDigestMessage(entries);
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
    const result = formatDigestMessage(entries);
    expect(result.text).toContain('@628111111111');
    expect(result.text).toContain('Bob');
    expect(result.text).not.toContain('@Bob');
    expect(result.mentions).toEqual(['628111111111@c.us']);
  });

  it('rule explainer sits immediately above Keep showing up line', () => {
    const entries = [makeEntry('628111111111', 'Alice', 10, 5, 5, false)];
    const result = formatDigestMessage(entries);
    const noteIdx = result.text.indexOf(RULE_NOTE);
    const closingIdx = result.text.indexOf('Keep showing up. Consistency wins. 💪');
    expect(noteIdx).toBeGreaterThan(-1);
    expect(closingIdx).toBeGreaterThan(-1);
    expect(result.text.slice(noteIdx + RULE_NOTE.length)).toBe(
      '\n\nKeep showing up. Consistency wins. 💪'
    );
  });

  it('rule explainer is present in the empty-leaderboard branch', () => {
    const result = formatDigestMessage([]);
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
    const result = formatLeaderboardMessage([]);
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
    const result = formatLeaderboardMessage(entries);
    expect(result.text).toContain('🥇 First');
    expect(result.text).toContain('🥈 Second');
    expect(result.text).toContain('🥉 Third');
    expect(result.text).toContain('🌱 Fourth');
  });

  it('omits streak section when both currentStreak and bestStreak are 0', () => {
    const entries = [makeEntry('628111111111', 'Budi', 4, 0, 0)];
    const result = formatLeaderboardMessage(entries);
    expect(result.text).toContain('4 sessions');
    expect(result.text).not.toContain('🔥 Streak');
    expect(result.text).not.toContain('🔥');
  });

  it('appends (Best Y days) only when bestStreak > currentStreak', () => {
    const withBest = [makeEntry('628111111111', 'Farul', 24, 5, 8)];
    const resultWithBest = formatLeaderboardMessage(withBest);
    expect(resultWithBest.text).toContain('(Best 8 days)');

    const equalStreak = [makeEntry('628222222222', 'Ari', 18, 5, 5)];
    const resultEqual = formatLeaderboardMessage(equalStreak);
    expect(resultEqual.text).not.toContain('Best');
  });

  it('shows at-risk warning before the header when one user is at risk', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry('628222222222', 'Bob', 8, 3, 3, false),
    ];
    const result = formatLeaderboardMessage(entries);
    expect(result.text).toContain('@628111111111');
    expect(result.text).toContain('workout today or your streak ends tomorrow');
    const warningIdx = result.text.indexOf('@628111111111');
    const headerIdx = result.text.indexOf('Workout Leaderboard This Month 🏆');
    expect(warningIdx).toBeLessThan(headerIdx);
  });

  it('at-risk warning uses @phone token derived from phoneNumber, not the display name', () => {
    const entries = [makeEntry('628111111111', 'Alice', 10, 5, 5, true)];
    const result = formatLeaderboardMessage(entries);
    expect(result.text).toContain('@628111111111');
    expect(result.text).not.toContain('@Alice');
  });

  it('tags multiple at-risk users comma-joined in a single warning line', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry('628222222222', 'Bob', 8, 3, 3, true),
      makeEntry('628333333333', 'Carol', 6, 0, 0, false),
    ];
    const result = formatLeaderboardMessage(entries);
    expect(result.text).toContain('@628111111111, @628222222222');
  });

  it('mentions array contains exactly the at-risk users JIDs in input order', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry('628222222222', 'Bob', 8, 3, 3, true),
      makeEntry('628333333333', 'Carol', 6, 0, 0, false),
    ];
    const result = formatLeaderboardMessage(entries);
    expect(result.mentions).toEqual(['628111111111@c.us', '628222222222@c.us']);
  });

  it('omits warning when no entries are at risk', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, false),
      makeEntry('628222222222', 'Bob', 8, 3, 3, false),
    ];
    const result = formatLeaderboardMessage(entries);
    expect(result.text).not.toContain('workout today or your streak ends tomorrow');
    expect(result.mentions).toEqual([]);
  });

  it('at-risk user with null phoneNumber falls back to plain display name in text, not in mentions', () => {
    const entries = [makeEntry(null, 'Alice', 10, 5, 5, true)];
    const result = formatLeaderboardMessage(entries);
    expect(result.text).toContain('Alice');
    expect(result.text).not.toContain('@Alice');
    expect(result.mentions).toEqual([]);
  });

  it('mixed at-risk: user with phone gets @mention, user with null phone gets plain name', () => {
    const entries = [
      makeEntry('628111111111', 'Alice', 10, 5, 5, true),
      makeEntry(null, 'Bob', 8, 3, 3, true),
    ];
    const result = formatLeaderboardMessage(entries);
    expect(result.text).toContain('@628111111111');
    expect(result.text).toContain('Bob');
    expect(result.text).not.toContain('@Bob');
    expect(result.mentions).toEqual(['628111111111@c.us']);
  });

  it('rule explainer is the last line in the at-risk case', () => {
    const entries = [makeEntry('628111111111', 'Alice', 10, 5, 5, true)];
    const result = formatLeaderboardMessage(entries);
    expect(result.text.endsWith(RULE_NOTE)).toBe(true);
  });

  it('rule explainer is the last line in the not-at-risk case', () => {
    const entries = [makeEntry('628111111111', 'Alice', 10, 5, 5, false)];
    const result = formatLeaderboardMessage(entries);
    expect(result.text.endsWith(RULE_NOTE)).toBe(true);
  });

  it('rule explainer is present in the empty-leaderboard branch', () => {
    const result = formatLeaderboardMessage([]);
    expect(result.text).toContain(RULE_NOTE);
  });
});

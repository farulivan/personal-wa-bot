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
    user: string,
    sessionsInMonth: number,
    currentStreak: number,
    bestStreak: number
  ): WorkoutLeaderboardEntry => ({
    user,
    sessionsInMonth,
    currentStreak,
    bestStreak,
    atRisk: false,
  });

  it('returns morning header + empty leaderboard message when entries are empty', () => {
    const result = formatDigestMessage([]);
    expect(result).toContain('Good morning team 👋');
    expect(result).toContain('Workout Leaderboard This Month 🏆');
    expect(result).toContain('No workouts logged this month');
    expect(result).toContain('#workout lift push up 20reps 4sets');
  });

  it('wraps the leaderboard body with morning header and closing line', () => {
    const entries = [
      makeEntry('First', 10, 5, 5),
      makeEntry('Second', 8, 3, 7),
      makeEntry('Third', 6, 0, 0),
      makeEntry('Fourth', 4, 0, 0),
    ];
    const result = formatDigestMessage(entries);
    expect(result.startsWith('Good morning team 👋')).toBe(true);
    expect(result).toContain('Workout Leaderboard This Month 🏆');
    expect(result).toContain('🥇 First');
    expect(result).toContain('🥈 Second');
    expect(result).toContain('🥉 Third');
    expect(result).toContain('🌱 Fourth');
    expect(result).toContain('🏋️ 10 sessions');
    expect(result).toContain('Keep showing up. Consistency wins. 💪');
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
    user: string,
    sessionsInMonth: number,
    currentStreak: number,
    bestStreak: number
  ): WorkoutLeaderboardEntry => ({
    user,
    sessionsInMonth,
    currentStreak,
    bestStreak,
    atRisk: false,
  });

  it('returns empty-state message with CTA when entries array is empty', () => {
    const result = formatLeaderboardMessage([]);
    expect(result).toContain('#workout lift push up 20reps 4sets');
    expect(result).toContain('No workouts logged this month');
  });

  it('assigns medal prefixes to top 3 and 🌱 to 4th+', () => {
    const entries = [
      makeEntry('First', 10, 0, 0),
      makeEntry('Second', 8, 0, 0),
      makeEntry('Third', 6, 0, 0),
      makeEntry('Fourth', 4, 0, 0),
    ];
    const result = formatLeaderboardMessage(entries);
    expect(result).toContain('🥇 First');
    expect(result).toContain('🥈 Second');
    expect(result).toContain('🥉 Third');
    expect(result).toContain('🌱 Fourth');
  });

  it('omits streak section when both currentStreak and bestStreak are 0', () => {
    const entries = [makeEntry('Budi', 4, 0, 0)];
    const result = formatLeaderboardMessage(entries);
    expect(result).toContain('4 sessions');
    expect(result).not.toContain('Streak');
    expect(result).not.toContain('🔥');
  });

  it('appends (Best Y days) only when bestStreak > currentStreak', () => {
    const withBest = [makeEntry('Farul', 24, 5, 8)];
    const resultWithBest = formatLeaderboardMessage(withBest);
    expect(resultWithBest).toContain('(Best 8 days)');

    const equalStreak = [makeEntry('Ari', 18, 5, 5)];
    const resultEqual = formatLeaderboardMessage(equalStreak);
    expect(resultEqual).not.toContain('Best');
  });
});

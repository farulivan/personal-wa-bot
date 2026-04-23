import { describe, it, expect } from 'vitest';
import {
  formatUndoSuccess,
  formatUndoNoLogs,
  formatUndoTooLate,
  formatDigestMessage,
} from './workoutPresenter.js';
import { UNDO_WINDOW_MS } from './workoutService.js';
import type { WorkoutEntry } from './infra/workoutRepository.js';

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
  it('returns fallback message for empty standings', () => {
    const result = formatDigestMessage([]);
    expect(result).toContain('No active streaks');
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

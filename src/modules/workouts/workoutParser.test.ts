import { describe, it, expect } from 'vitest';
import {
  parseLiftPayload,
  parseCardioPayload,
  parseWorkoutPayload,
  parsePageNumber,
  tokenize,
  isLegacyMultiline,
} from './workoutParser.js';
import { parseCommand } from '../../app/parseCommand.js';

describe('tokenize', () => {
  it('splits on whitespace', () => {
    expect(tokenize('#workout lift bench 10reps 3sets')).toEqual([
      '#workout',
      'lift',
      'bench',
      '10reps',
      '3sets',
    ]);
  });

  it('handles multiple spaces', () => {
    expect(tokenize('a  b   c')).toEqual(['a', 'b', 'c']);
  });
});

describe('isLegacyMultiline', () => {
  it('detects newline', () => {
    expect(isLegacyMultiline('#workout\ntype: bench')).toBe(true);
  });

  it('detects key: value pattern', () => {
    expect(isLegacyMultiline('#workout reps: 10')).toBe(true);
  });

  it('returns false for single-line modern format', () => {
    expect(isLegacyMultiline('#workout lift bench 10reps 3sets')).toBe(false);
  });
});

describe('parseLiftPayload', () => {
  it('parses minimal lift: activity reps sets', () => {
    const tokens = ['#workout', 'lift', 'bench', '10reps', '3sets'];
    const result = parseLiftPayload(tokens);
    expect(result.ok).toBe(true);
    if (result.ok && result.value.mode === 'lift') {
      expect(result.value.activity).toBe('bench');
      expect(result.value.reps).toBe(10);
      expect(result.value.sets).toBe(3);
      expect(result.value.weight).toBe(0);
    }
  });

  it('parses lift with weight', () => {
    const tokens = ['#workout', 'lift', 'bench', '10reps', '3sets', '60kg'];
    const result = parseLiftPayload(tokens);
    expect(result.ok).toBe(true);
    if (result.ok && result.value.mode === 'lift') {
      expect(result.value.weight).toBe(60);
    }
  });

  it('parses multi-word activity', () => {
    const tokens = ['#workout', 'lift', 'push', 'up', '20reps', '4sets'];
    const result = parseLiftPayload(tokens);
    expect(result.ok).toBe(true);
    if (result.ok && result.value.mode === 'lift') expect(result.value.activity).toBe('push up');
  });

  it('accepts rep (singular) token', () => {
    const tokens = ['#workout', 'lift', 'squat', '10rep', '3sets'];
    const result = parseLiftPayload(tokens);
    expect(result.ok).toBe(true);
    if (result.ok && result.value.mode === 'lift') expect(result.value.reps).toBe(10);
  });

  it('accepts set (singular) token', () => {
    const tokens = ['#workout', 'lift', 'squat', '10reps', '3set'];
    const result = parseLiftPayload(tokens);
    expect(result.ok).toBe(true);
    if (result.ok && result.value.mode === 'lift') expect(result.value.sets).toBe(3);
  });

  it('returns error when too few tokens', () => {
    const result = parseLiftPayload(['#workout', 'lift', 'bench']);
    expect(result.ok).toBe(false);
  });

  it('returns error for invalid reps token', () => {
    const tokens = ['#workout', 'lift', 'bench', 'tenreps', '3sets'];
    const result = parseLiftPayload(tokens);
    expect(result.ok).toBe(false);
  });

  it('returns error for invalid sets token', () => {
    const tokens = ['#workout', 'lift', 'bench', '10reps', 'threesets'];
    const result = parseLiftPayload(tokens);
    expect(result.ok).toBe(false);
  });

  it('returns error for invalid weight format', () => {
    const tokens = ['#workout', 'lift', 'bench', '10reps', '3sets', '60lbs'];
    const result = parseLiftPayload(tokens);
    expect(result.ok).toBe(false);
  });
});

describe('parseCardioPayload', () => {
  it('parses cardio with duration only', () => {
    const tokens = ['#workout', 'cardio', 'run', '30min'];
    const result = parseCardioPayload(tokens);
    expect(result.ok).toBe(true);
    if (result.ok && result.value.mode === 'cardio') {
      expect(result.value.activity).toBe('run');
      expect(result.value.durationMinutes).toBe(30);
      expect(result.value.distanceKm).toBe(0);
    }
  });

  it('parses cardio with duration and distance', () => {
    const tokens = ['#workout', 'cardio', 'run', '30min', '5km'];
    const result = parseCardioPayload(tokens);
    expect(result.ok).toBe(true);
    if (result.ok && result.value.mode === 'cardio') {
      expect(result.value.durationMinutes).toBe(30);
      expect(result.value.distanceKm).toBe(5);
    }
  });

  it('converts hour to minutes', () => {
    const tokens = ['#workout', 'cardio', 'cycle', '1hour'];
    const result = parseCardioPayload(tokens);
    expect(result.ok).toBe(true);
    if (result.ok && result.value.mode === 'cardio') expect(result.value.durationMinutes).toBe(60);
  });

  it('parses multi-word activity', () => {
    const tokens = ['#workout', 'cardio', 'jump', 'rope', '20min'];
    const result = parseCardioPayload(tokens);
    expect(result.ok).toBe(true);
    if (result.ok && result.value.mode === 'cardio')
      expect(result.value.activity).toBe('jump rope');
  });

  it('returns error when too few tokens', () => {
    const result = parseCardioPayload(['#workout', 'cardio', 'run']);
    expect(result.ok).toBe(false);
  });

  it('returns error for invalid duration unit', () => {
    const tokens = ['#workout', 'cardio', 'run', '30seconds'];
    const result = parseCardioPayload(tokens);
    expect(result.ok).toBe(false);
  });
});

describe('parseWorkoutPayload', () => {
  function makeInvocation(text: string) {
    const inv = parseCommand(text);
    if (!inv) throw new Error('parseCommand returned null');
    return inv;
  }

  it('routes to lift parser', () => {
    const result = parseWorkoutPayload(makeInvocation('#workout lift bench 10reps 3sets'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.mode).toBe('lift');
  });

  it('routes to cardio parser', () => {
    const result = parseWorkoutPayload(makeInvocation('#workout cardio run 30min'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.mode).toBe('cardio');
  });

  it('returns error for unknown mode', () => {
    const result = parseWorkoutPayload(makeInvocation('#workout swim 30min'));
    expect(result.ok).toBe(false);
  });

  it('returns error for legacy multiline format', () => {
    const result = parseWorkoutPayload(makeInvocation('#workout\ntype: bench\nreps: 10'));
    expect(result.ok).toBe(false);
  });
});

describe('parsePageNumber', () => {
  it('returns 1 by default', () => {
    expect(parsePageNumber('#workout --list')).toBe(1);
  });

  it('extracts page number from token', () => {
    expect(parsePageNumber('#workout --list 3')).toBe(3);
  });

  it('clamps to minimum 1', () => {
    expect(parsePageNumber('#workout --list 0')).toBe(1);
  });
});

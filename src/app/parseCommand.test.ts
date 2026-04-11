import { describe, it, expect } from 'vitest';
import { parseCommand } from './parseCommand.js';

describe('parseCommand', () => {
  it('returns null for non-command text', () => {
    expect(parseCommand('hello world')).toBeNull();
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('  ')).toBeNull();
  });

  it('returns null for bare # with no namespace', () => {
    expect(parseCommand('#')).toBeNull();
  });

  it('parses a basic namespace with default subcommand', () => {
    const result = parseCommand('#workout lift push up 10reps 3sets');
    expect(result).not.toBeNull();
    expect(result!.namespace).toBe('workout');
    expect(result!.subcommand).toBe('log');
    expect(result!.firstLine).toBe('#workout lift push up 10reps 3sets');
  });

  it('parses subcommand from --flag', () => {
    const result = parseCommand('#workout --list');
    expect(result!.namespace).toBe('workout');
    expect(result!.subcommand).toBe('list');
  });

  it('parses multiline: firstLine vs payloadText', () => {
    const result = parseCommand('#quran --log\n5');
    expect(result!.namespace).toBe('quran');
    expect(result!.subcommand).toBe('log');
    expect(result!.payloadText).toBe('5');
  });

  it('preserves rawText exactly', () => {
    const text = '#remind 2026-03-10 10:30 Buy milk';
    const result = parseCommand(text);
    expect(result!.rawText).toBe(text);
  });

  it('lowercases namespace and subcommand', () => {
    const result = parseCommand('#WORKOUT --LIST');
    expect(result!.namespace).toBe('workout');
    expect(result!.subcommand).toBe('list');
  });

  it('handles extra whitespace in first line tokens', () => {
    const result = parseCommand('#sholat  --today');
    expect(result!.namespace).toBe('sholat');
    expect(result!.subcommand).toBe('today');
  });
});

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

  it('parses positional subcommand from second token', () => {
    const result = parseCommand('#workout lift push up 10reps 3sets');
    expect(result).not.toBeNull();
    expect(result!.namespace).toBe('workout');
    expect(result!.subcommand).toBe('lift');
    expect(result!.deprecatedFlag).toBeNull();
    expect(result!.firstLine).toBe('#workout lift push up 10reps 3sets');
  });

  it('sets empty subcommand when second token is a --flag', () => {
    const result = parseCommand('#sholat --today');
    expect(result!.namespace).toBe('sholat');
    expect(result!.subcommand).toBe('');
    expect(result!.deprecatedFlag).toBeNull();
  });

  it('sets empty subcommand when namespace is alone', () => {
    const result = parseCommand('#quran');
    expect(result!.namespace).toBe('quran');
    expect(result!.subcommand).toBe('');
    expect(result!.deprecatedFlag).toBeNull();
  });

  it('detects deprecated --list flag', () => {
    const result = parseCommand('#workout --list');
    expect(result!.namespace).toBe('workout');
    expect(result!.subcommand).toBe('');
    expect(result!.deprecatedFlag).toBe('list');
  });

  it('detects deprecated --leaderboard flag', () => {
    const result = parseCommand('#quran --leaderboard');
    expect(result!.subcommand).toBe('');
    expect(result!.deprecatedFlag).toBe('leaderboard');
  });

  it('detects deprecated --mark flag', () => {
    const result = parseCommand('#quran --mark');
    expect(result!.subcommand).toBe('');
    expect(result!.deprecatedFlag).toBe('mark');
  });

  it('does not flag --help as deprecated', () => {
    const result = parseCommand('#workout --help');
    expect(result!.subcommand).toBe('');
    expect(result!.deprecatedFlag).toBeNull();
  });

  it('does not flag --no-mark as deprecated', () => {
    const result = parseCommand('#quran read 3 --no-mark');
    expect(result!.subcommand).toBe('read');
    expect(result!.deprecatedFlag).toBeNull();
  });

  it('does not flag --today or --location as deprecated', () => {
    const result = parseCommand('#sholat --today --location bandung');
    expect(result!.subcommand).toBe('');
    expect(result!.deprecatedFlag).toBeNull();
  });

  it('parses multiline: firstLine vs payloadText', () => {
    const result = parseCommand('#quran read\n5');
    expect(result!.namespace).toBe('quran');
    expect(result!.subcommand).toBe('read');
    expect(result!.payloadText).toBe('5');
  });

  it('preserves rawText exactly', () => {
    const text = '#remind 2026-03-10 10:30 Buy milk';
    const result = parseCommand(text);
    expect(result!.rawText).toBe(text);
  });

  it('lowercases namespace and subcommand', () => {
    const result = parseCommand('#WORKOUT LIST');
    expect(result!.namespace).toBe('workout');
    expect(result!.subcommand).toBe('list');
  });

  it('lowercases deprecated flag detection', () => {
    const result = parseCommand('#WORKOUT --LIST');
    expect(result!.namespace).toBe('workout');
    expect(result!.subcommand).toBe('');
    expect(result!.deprecatedFlag).toBe('list');
  });

  it('handles extra whitespace in first line tokens', () => {
    const result = parseCommand('#sholat  --today');
    expect(result!.namespace).toBe('sholat');
    expect(result!.subcommand).toBe('');
  });
});

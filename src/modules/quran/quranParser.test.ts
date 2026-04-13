import { describe, it, expect } from 'vitest';
import {
  parseReadInput,
  parseMarkPage,
  tokenize,
  parsePageNumber,
  detectAction,
} from './quranParser.js';
import type { CommandInvocation } from '../../app/parseCommand.js';

describe('tokenize', () => {
  it('splits on whitespace and removes empty tokens', () => {
    expect(tokenize('  #quran  read  3 ')).toEqual(['#quran', 'read', '3']);
  });
});

describe('parsePageNumber', () => {
  it('returns the first numeric token', () => {
    expect(parsePageNumber('#quran --list 3')).toBe(3);
  });

  it('returns 1 when no numeric token exists', () => {
    expect(parsePageNumber('#quran --list')).toBe(1);
  });

  it('clamps to minimum 1', () => {
    expect(parsePageNumber('#quran --list 0')).toBe(1);
  });
});

describe('detectAction', () => {
  it('returns the second token lowercased', () => {
    const inv = { firstLine: '#quran Read 3' } as CommandInvocation;
    expect(detectAction(inv)).toBe('read');
  });

  it('returns empty string if only namespace token', () => {
    const inv = { firstLine: '#quran' } as CommandInvocation;
    expect(detectAction(inv)).toBe('');
  });
});

describe('parseReadInput', () => {
  it('parses valid page count', () => {
    const result = parseReadInput('#quran read 5');
    expect(result).toEqual({ ok: true, value: { pages: 5, noMark: false } });
  });

  it('parses page count with --no-mark flag', () => {
    const result = parseReadInput('#quran read 3 --no-mark');
    expect(result).toEqual({ ok: true, value: { pages: 3, noMark: true } });
  });

  it('accepts "log" as alias for "read"', () => {
    const result = parseReadInput('#quran log 2');
    expect(result).toEqual({ ok: true, value: { pages: 2, noMark: false } });
  });

  it('rejects missing page count', () => {
    const result = parseReadInput('#quran read');
    expect(result.ok).toBe(false);
  });

  it('rejects decimal page count', () => {
    const result = parseReadInput('#quran read 2.5');
    expect(result.ok).toBe(false);
  });

  it('rejects zero pages', () => {
    const result = parseReadInput('#quran read 0');
    expect(result.ok).toBe(false);
  });

  it('rejects negative-looking input (non-numeric)', () => {
    const result = parseReadInput('#quran read -3');
    expect(result.ok).toBe(false);
  });

  it('rejects pages exceeding daily limit (50)', () => {
    const result = parseReadInput('#quran read 51');
    expect(result.ok).toBe(false);
  });

  it('accepts exactly 50 pages', () => {
    const result = parseReadInput('#quran read 50');
    expect(result).toEqual({ ok: true, value: { pages: 50, noMark: false } });
  });

  it('rejects unknown flags', () => {
    const result = parseReadInput('#quran read 3 --verbose');
    expect(result.ok).toBe(false);
  });

  it('rejects page count with trailing unit text', () => {
    const result = parseReadInput('#quran read 3 halaman');
    expect(result.ok).toBe(false);
  });

  it('rejects non-numeric input', () => {
    const result = parseReadInput('#quran read abc');
    expect(result.ok).toBe(false);
  });
});

describe('parseMarkPage', () => {
  it('parses valid page number', () => {
    expect(parseMarkPage('145')).toEqual({ ok: true, value: 145 });
  });

  it('accepts page 1', () => {
    expect(parseMarkPage('1')).toEqual({ ok: true, value: 1 });
  });

  it('accepts page 604 (max)', () => {
    expect(parseMarkPage('604')).toEqual({ ok: true, value: 604 });
  });

  it('rejects page 0', () => {
    expect(parseMarkPage('0').ok).toBe(false);
  });

  it('rejects page above 604', () => {
    expect(parseMarkPage('605').ok).toBe(false);
  });

  it('rejects decimal', () => {
    expect(parseMarkPage('145.5').ok).toBe(false);
  });

  it('rejects empty string', () => {
    expect(parseMarkPage('').ok).toBe(false);
  });

  it('rejects non-numeric', () => {
    expect(parseMarkPage('abc').ok).toBe(false);
  });

  it('handles whitespace around value', () => {
    expect(parseMarkPage('  200  ')).toEqual({ ok: true, value: 200 });
  });
});

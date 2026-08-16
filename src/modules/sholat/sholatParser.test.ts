import { describe, it, expect } from 'vitest';
import {
  hasFlag,
  extractFlagValue,
  normalizeText,
  normalizeForMatch,
  normalizeUserLocationInput,
} from './sholatParser.js';

describe('sholatParser', () => {
  describe('hasFlag', () => {
    it('detects a flag present as its own token', () => {
      expect(hasFlag('#sholat --today', 'today')).toBe(true);
      expect(hasFlag('#sholat --today --location bandung', 'location')).toBe(true);
    });

    it('returns false when the flag is absent', () => {
      expect(hasFlag('#sholat', 'today')).toBe(false);
      expect(hasFlag('#sholat --location bandung', 'today')).toBe(false);
    });

    it('is case-insensitive on both the token and the flag name', () => {
      expect(hasFlag('#sholat --TODAY', 'today')).toBe(true);
      expect(hasFlag('#sholat --today', 'TODAY')).toBe(true);
    });

    it('requires an exact token match, not a prefix', () => {
      // "--todays" must not satisfy the "today" flag.
      expect(hasFlag('#sholat --todays', 'today')).toBe(false);
    });

    it('treats --flag=value as an unknown token', () => {
      // Settled grammar, not a gap: ADR 0003 documents only the space form, and
      // parseCommand and quranParser agree. "#sholat --location=bandung" is
      // therefore not a location query and falls through to the help message.
      expect(hasFlag('#sholat --location=bandung', 'location')).toBe(false);
    });
  });

  describe('extractFlagValue', () => {
    it('returns a single-token value', () => {
      expect(extractFlagValue('#sholat --location bandung', 'location')).toBe('bandung');
    });

    it('joins a multi-word value up to the next flag', () => {
      expect(extractFlagValue('#sholat --location kab. bogor --today', 'location')).toBe(
        'kab. bogor'
      );
    });

    it('reads a multi-word value that runs to the end of the line', () => {
      expect(extractFlagValue('#sholat --today --location kab. bogor', 'location')).toBe(
        'kab. bogor'
      );
    });

    it('preserves the original casing of the value (normalisation happens later)', () => {
      expect(extractFlagValue('#sholat --location Kab. Bogor', 'location')).toBe('Kab. Bogor');
    });

    it('returns empty string when the flag has no value', () => {
      expect(extractFlagValue('#sholat --today --location', 'location')).toBe('');
      expect(extractFlagValue('#sholat --location --today', 'location')).toBe('');
    });

    it('returns empty string when the flag is absent', () => {
      expect(extractFlagValue('#sholat --today', 'location')).toBe('');
    });

    it('ignores the --flag=value form, matching hasFlag and the other parsers', () => {
      // The = form is not part of the command grammar (ADR 0003). extractFlagValue
      // used to be the only place in the codebase that accepted it, which read as
      // though it were supported.
      expect(extractFlagValue('#sholat --location=bandung', 'location')).toBe('');
      expect(extractFlagValue('#sholat --location=kab. bogor', 'location')).toBe('');
    });
  });

  describe('normalizeText', () => {
    it('uppercases the input', () => {
      expect(normalizeText('bogor')).toBe('BOGOR');
    });

    it('replaces punctuation with spaces and collapses runs of whitespace', () => {
      expect(normalizeText('Kab.  Bogor!!')).toBe('KAB BOGOR');
      expect(normalizeText('kota   bandung')).toBe('KOTA BANDUNG');
    });

    it('trims leading and trailing whitespace', () => {
      expect(normalizeText('  bandung  ')).toBe('BANDUNG');
    });

    it('keeps digits', () => {
      expect(normalizeText('region 5')).toBe('REGION 5');
    });
  });

  describe('normalizeForMatch', () => {
    it('collapses the "KABUPATEN" prefix to "KAB"', () => {
      expect(normalizeForMatch('Kabupaten Bogor')).toBe('KAB BOGOR');
    });

    it('leaves an already-short "KAB." prefix as "KAB"', () => {
      expect(normalizeForMatch('KAB. BOGOR')).toBe('KAB BOGOR');
    });

    it('collapses the "KOTAMADYA" prefix to "KOTA"', () => {
      expect(normalizeForMatch('Kotamadya Bandung')).toBe('KOTA BANDUNG');
    });

    it('leaves an already-short "KOTA" prefix as "KOTA"', () => {
      expect(normalizeForMatch('Kota Bandung')).toBe('KOTA BANDUNG');
    });

    it('leaves a name without an administrative prefix untouched (beyond normalising)', () => {
      expect(normalizeForMatch('Bogor')).toBe('BOGOR');
    });
  });

  describe('normalizeUserLocationInput', () => {
    it('defaults a bare place name to the "KOTA" form', () => {
      expect(normalizeUserLocationInput('bandung')).toBe('KOTA BANDUNG');
    });

    it('canonicalises an explicit "kota" prefix', () => {
      expect(normalizeUserLocationInput('kota bandung')).toBe('KOTA BANDUNG');
      expect(normalizeUserLocationInput('Kota Bandung')).toBe('KOTA BANDUNG');
    });

    it('canonicalises "kab" and "kabupaten" to "KAB."', () => {
      expect(normalizeUserLocationInput('kab bogor')).toBe('KAB. BOGOR');
      expect(normalizeUserLocationInput('kabupaten bogor')).toBe('KAB. BOGOR');
    });

    it('accepts dot, hyphen, underscore, or space as the prefix separator', () => {
      expect(normalizeUserLocationInput('kab. bogor')).toBe('KAB. BOGOR');
      expect(normalizeUserLocationInput('kab-bandung')).toBe('KAB. BANDUNG');
      expect(normalizeUserLocationInput('kota_bandung')).toBe('KOTA BANDUNG');
    });

    it('collapses surrounding and internal whitespace', () => {
      expect(normalizeUserLocationInput('  kab   bogor  ')).toBe('KAB. BOGOR');
    });

    it('mis-parses a name that merely starts with the prefix letters (known sharp edge)', () => {
      // Characterisation, NOT desired behaviour (see issue #58): the greedy prefix
      // match treats any input beginning with "kab"/"kota" as the administrative
      // prefix, so real place names like "Kabanjahe" (a town, not "Kabupaten
      // Anjahe") are mangled. Update this assertion once #58 is fixed.
      expect(normalizeUserLocationInput('kabanjahe')).toBe('KAB. ANJAHE');
    });
  });

  describe('normalization invariant: user input resolves to the same match key as DB names', () => {
    // sholatService fuzzy-matches by comparing normalizeForMatch(normalizeUserLocationInput(input))
    // against normalizeForMatch(dbLocationName). These must agree for lookups to succeed.
    const matchKey = (raw: string) => normalizeForMatch(raw);
    const userKey = (raw: string) => normalizeForMatch(normalizeUserLocationInput(raw));

    it('matches a regency typed loosely against its official DB name', () => {
      expect(userKey('kab bogor')).toBe(matchKey('KABUPATEN BOGOR'));
      expect(userKey('kab. bogor')).toBe(matchKey('KABUPATEN BOGOR'));
      expect(userKey('kabupaten bogor')).toBe(matchKey('KABUPATEN BOGOR'));
    });

    it('matches a bare city name against its "KOTA" DB name', () => {
      expect(userKey('bandung')).toBe(matchKey('KOTA BANDUNG'));
      expect(userKey('kota bandung')).toBe(matchKey('KOTA BANDUNG'));
    });
  });
});

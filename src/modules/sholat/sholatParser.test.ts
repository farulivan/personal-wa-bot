import { describe, it, expect } from 'vitest';
import {
  hasFlag,
  extractFlagValue,
  normalizeText,
  normalizeForMatch,
  parseLocationQuery,
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
});

describe('parseLocationQuery', () => {
  describe('explicit — a prefix separated from the name', () => {
    it.each([
      ['kab. bogor', 'KAB BOGOR'],
      ['kabupaten bogor', 'KAB BOGOR'],
      ['kab bogor', 'KAB BOGOR'],
      ['  kab   bogor  ', 'KAB BOGOR'],
      ['kab-bandung', 'KAB BANDUNG'],
      ['kota_bandung', 'KOTA BANDUNG'],
      ['kota bandung', 'KOTA BANDUNG'],
    ])('%s -> explicit %s', (input, exactKey) => {
      expect(parseLocationQuery(input)).toEqual({ form: 'explicit', exactKey });
    });

    it('treats a dot as a separator, so kab.bandung is explicit', () => {
      // The help text already advertises `kab-bandung`; refusing the dot form
      // would contradict our own documentation.
      expect(parseLocationQuery('kab.bandung')).toEqual({
        form: 'explicit',
        exactKey: 'KAB BANDUNG',
      });
    });

    it('classifies the shipped SHOLAT_DEFAULT_LOCATION', () => {
      // The reminder ticker and prefetch job both resolve through this value.
      // If it stops classifying as explicit, reminders die silently.
      expect(parseLocationQuery('KAB. BOGOR')).toEqual({
        form: 'explicit',
        exactKey: 'KAB BOGOR',
      });
    });
  });

  describe('bare — no administrative prefix', () => {
    it('offers both a city and a regency candidate', () => {
      expect(parseLocationQuery('bandung')).toEqual({
        form: 'bare',
        exactKey: 'BANDUNG',
        cityKey: 'KOTA BANDUNG',
        regencyKey: 'KAB BANDUNG',
      });
    });

    it('works for a multi-word name', () => {
      expect(parseLocationQuery('aceh barat')).toMatchObject({
        form: 'bare',
        regencyKey: 'KAB ACEH BARAT',
      });
    });

    it('handles a catalogue row that carries no prefix at all', () => {
      expect(parseLocationQuery('pulau tambelan kab. bintan')).toMatchObject({
        form: 'bare',
        exactKey: 'PULAU TAMBELAN KAB BINTAN',
      });
    });
  });

  describe('glued — prefix letters running into the name', () => {
    it('offers a split key for a genuine typo', () => {
      expect(parseLocationQuery('kabbandung')).toMatchObject({
        form: 'glued',
        splitKey: 'KAB BANDUNG',
      });
      expect(parseLocationQuery('kotabandung')).toMatchObject({
        form: 'glued',
        splitKey: 'KOTA BANDUNG',
      });
    });

    it('splits on the longest prefix, not the shortest', () => {
      expect(parseLocationQuery('kabupatenbogor')).toMatchObject({
        form: 'glued',
        splitKey: 'KAB BOGOR',
      });
    });

    it('still offers city and regency keys, because real names look glued', () => {
      // KAB. KOTABARU and KOTA KOTAMOBAGU are real entries. If the caller
      // treated `glued` as terminal, both would become unreachable.
      expect(parseLocationQuery('kotabaru')).toMatchObject({
        form: 'glued',
        regencyKey: 'KAB KOTABARU',
      });
      expect(parseLocationQuery('kotamobagu')).toMatchObject({
        form: 'glued',
        cityKey: 'KOTA KOTAMOBAGU',
      });
    });

    it('offers a split for a name that only looks prefixed', () => {
      // Kabanjahe is a real town, but the catalogue lists KAB. KARO instead, so
      // this correctly ends as not-found once the caller tries every key.
      expect(parseLocationQuery('kabanjahe')).toMatchObject({
        form: 'glued',
        splitKey: 'KAB ANJAHE',
      });
    });
  });

  describe('lookup key invariant: query keys match stored normalized names', () => {
    it('builds keys in the same shape the catalogue stores', () => {
      expect(parseLocationQuery('bandung').form).toBe('bare');
      const bandung = parseLocationQuery('bandung');
      if (bandung.form === 'bare') {
        expect(bandung.cityKey).toBe(normalizeForMatch('KOTA BANDUNG'));
        expect(bandung.regencyKey).toBe(normalizeForMatch('KAB. BANDUNG'));
      }
      expect(parseLocationQuery('kab bogor').exactKey).toBe(normalizeForMatch('KABUPATEN BOGOR'));
      expect(parseLocationQuery('kota bandung').exactKey).toBe(
        normalizeForMatch('Kotamadya Bandung')
      );
    });
  });
});

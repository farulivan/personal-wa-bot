import { tokenize } from '../../shared/parsing.js';

export function hasFlag(firstLine: string, flag: string): boolean {
  return tokenize(firstLine).some((token) => token.toLowerCase() === `--${flag.toLowerCase()}`);
}

export function extractFlagValue(firstLine: string, flag: string): string {
  const tokens = tokenize(firstLine);
  const lowerFlag = `--${flag.toLowerCase()}`;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const tokenLower = token.toLowerCase();

    if (tokenLower === lowerFlag) {
      const values: string[] = [];
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].startsWith('--')) break;
        values.push(tokens[j]);
      }
      return values.join(' ').trim();
    }
  }

  return '';
}

/**
 * ⚠️ Frozen. The output of this feeds `normalizeForMatch`, whose result is
 * **persisted** in `sholat_locations.normalized_location_name` at catalogue-sync
 * time. `ensureLocationCatalog` only syncs when the table is empty, so a
 * deployed database never re-normalises. Changing this desynchronises stored
 * keys from computed ones and silently breaks every location lookup, with no
 * migration to catch it. See ADR 0006.
 */
export function normalizeText(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ⚠️ Frozen — its output is persisted. See the note on `normalizeText`. */
export function normalizeForMatch(raw: string): string {
  const normalized = normalizeText(raw)
    .replace(/^KABUPATEN\s+/, 'KAB ')
    .replace(/^KAB\s+/, 'KAB ')
    .replace(/^KOTAMADYA\s+/, 'KOTA ')
    .replace(/^KOTA\s+/, 'KOTA ');

  return normalized;
}

/**
 * How the user wrote a location, plus the exact keys to look it up by. Keys are
 * built in the same shape as `sholat_locations.normalized_location_name`, so
 * every lookup is an equality check.
 */
export type LocationQuery =
  /** Prefix and name separated: "kab. bogor", "kabupaten bogor", "kab-bandung". */
  | { form: 'explicit'; exactKey: string }
  /** No administrative prefix at all: "bandung", "aceh barat". */
  | { form: 'bare'; exactKey: string; cityKey: string; regencyKey: string }
  /** Prefix letters glued to the rest: "kabbandung" (a typo) or "kotabaru" (a real name). */
  | { form: 'glued'; exactKey: string; cityKey: string; regencyKey: string; splitKey: string };

/** `.`, `-`, `_` and whitespace all separate a prefix from the name — the help text advertises `kab-bandung`. */
const PREFIX_WITH_SEPARATOR = /^(?:kabupaten|kotamadya|kab|kota)[.\s_-]+\S/i;

/** Longest alternative first, so "kabupatenbogor" splits as kabupaten+bogor rather than kab+upatenbogor. */
const PREFIX_GLUED = /^(kabupaten|kotamadya|kab|kota)([a-z0-9].*)$/i;

/**
 * Classifies a `--location` value and precomputes every key it could match.
 *
 * `glued` is a hint, not a verdict: real catalogue entries are named
 * `KAB. KOTABARU` and `KOTA KOTAMOBAGU`, so the caller must try `cityKey` and
 * `regencyKey` before falling back to `splitKey`.
 */
export function parseLocationQuery(raw: string): LocationQuery {
  const trimmed = raw.trim();
  const exactKey = normalizeForMatch(trimmed);

  if (PREFIX_WITH_SEPARATOR.test(trimmed)) {
    return { form: 'explicit', exactKey };
  }

  const base = normalizeText(trimmed);
  const cityKey = `KOTA ${base}`;
  const regencyKey = `KAB ${base}`;

  const glued = PREFIX_GLUED.exec(trimmed);
  if (glued) {
    return {
      form: 'glued',
      exactKey,
      cityKey,
      regencyKey,
      splitKey: normalizeForMatch(`${glued[1]} ${glued[2]}`),
    };
  }

  return { form: 'bare', exactKey, cityKey, regencyKey };
}

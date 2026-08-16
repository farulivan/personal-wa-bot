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
 * ⚠️ DO NOT CHANGE without re-syncing the location catalogue in the same deploy.
 *
 * This feeds `normalizeForMatch`, whose output is written into
 * `sholat_locations.normalized_location_name` when the catalogue is first
 * synced — and `ensureLocationCatalog` returns early once that table is
 * non-empty, so a deployed database never recomputes those keys.
 *
 * Change the rule and the two sides stop agreeing: lookups compute new keys
 * while the database still holds old ones, so **every location stops
 * resolving** — including `SHOLAT_DEFAULT_LOCATION`, which silently stops
 * prayer reminders. Nothing errors, and the tests stay green because they
 * build both sides in memory.
 *
 * If you must change it, call `syncLocationCatalog()` unconditionally once in
 * the same release. That is safe: `upsertLocations` never deletes, so the
 * cached schedules survive. See ADR 0006.
 */
export function normalizeText(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ⚠️ DO NOT CHANGE without re-syncing the location catalogue — this is the
 * function whose output is stored in the database. See the note on
 * `normalizeText` for what breaks and how to change it safely.
 */
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

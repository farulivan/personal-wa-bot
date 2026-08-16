# ADR 0006: Location resolution — exact candidates first, fuzzy last

- **Status:** Accepted
- **Date:** 2026-08-16

## Context

`#sholat --location <name>` matches free text against a catalogue of 517 Indonesian regencies and cities pulled from myQuran. The names are awkward in ways that matter:

- 417 are `KAB. X`, 95 are `KOTA X`, and 5 carry no prefix at all (`PULAU TAMBELAN KAB. BINTAN`).
- **26 names exist as both** a city and a regency — `BANDUNG`, `BOGOR`, `BEKASI`, `TANGERANG`. Typing the bare name is genuinely ambiguous.
- 201 names are several words long, and many are prefixes of each other: `KAB. PIDIE` / `KAB. PIDIE JAYA`, `KAB. ACEH BARAT` / `KAB. ACEH BARAT DAYA`.
- **Four names begin with prefix letters that are part of the name**, not an administrative prefix: `KAB. KOTABARU`, `KAB. KOTAWARINGIN BARAT`, `KAB. KOTAWARINGIN TIMUR`, `KOTA KOTAMOBAGU`.

The original resolver made one exact attempt after running the input through a function that *guessed* an administrative prefix, then fell back to substring matching. Because the guess rarely produced a real name, correctly-typed input skipped the exact path and landed in fuzzy, where `.includes()` matched more than one row:

```
pidie       →  AMBIGUOUS: KAB. PIDIE, KAB. PIDIE JAYA
aceh barat  →  AMBIGUOUS: KAB. ACEH BARAT, KAB. ACEH BARAT DAYA
```

Someone typed the name exactly right and got asked to be more specific.

## Decision

Classify the input, then try candidates in order, first match winning:

| # | Step | Example |
|---|---|---|
| 1 | Exact key match | `kab. bogor` → `KAB. BOGOR` |
| 2 | `KOTA <input>` — skipped when a prefix was typed | `bandung` → `KOTA BANDUNG` |
| 3 | `KAB. <input>` — same | `pidie` → `KAB. PIDIE` |
| 4 | Substring match: one hit resolves, several return the ambiguous message | `deli` → `KAB. DELI SERDANG` |
| 5 | A glued prefix whose separated form names a real place → **suggest** | `kabbandung` → *"Maksudmu KAB. BANDUNG?"* |
| 6 | Not found | `kabanjahe` |

`parseLocationQuery` (in `sholatParser.ts`, pure) reports whether the user wrote an **explicit** prefix, a **bare** name, or a **glued** prefix, and precomputes each key.

Three parts of this are load-bearing and easy to get wrong:

**Steps 2–3 are the entire fix.** They are what a human would try first, and trying them before substring matching is what stops a longer sibling winning.

**Fuzzy stays, demoted.** Deleting it was considered and rejected: it would have broken 59 partial lookups that work today (`deli`, `bandar`, `kulon`…) and replaced 42 helpful "did you mean one of these" lists with a bare not-found. The defect was ordering, not the existence of substring matching.

**Glued is a hint, not a verdict.** Because of the four `KOTA`/`KAB`-named places above, glued input must still try steps 2–3. Treating it as terminal makes `kotabaru` and `kotamobagu` unreachable — worse than the bug being fixed.

`.`, `-`, `_` and whitespace all count as separating a prefix, so `kab.bandung` and `kab-bandung` resolve. Only prefix letters running straight into the name are glued. The help text already advertised `kab-bandung`, and contradicting our own documentation to satisfy a tidier rule is a bad trade.

**No edit distance.** Suggestions are deterministic — an exact separated form, or nothing. Nothing to tune, and no chance of confidently proposing the wrong city.

Bare input that resolves to a city with a same-named regency, or to a regency with no city, carries a note so the reply can say which it chose. The service returns a discriminated value; the wording lives in the presenter.

## Consequences

Correctly-typed names resolve. `pidie`, `aceh barat` and every other name that is a prefix of a longer sibling now work. Verified against a live catalogue pull: **all 517 official names and all 517 bare forms resolve, zero regressions.**

The ambiguous message is still reachable, so partial input like `aceh` keeps its candidate list.

**`normalizeText` and `normalizeForMatch` are frozen.** Their output is persisted in `sholat_locations.normalized_location_name` at catalogue-sync time, and `ensureLocationCatalog` only syncs when the table is empty — a deployed database never re-normalises. Changing either silently desynchronises stored keys from computed ones and breaks every lookup, with no migration to catch it. Both carry a comment saying so. Anything that must change them has to force a catalogue re-sync in the same deploy.

The resolver builds a `Map` keyed on the normalized name. Safe because the catalogue has **zero duplicate keys** across 517 rows — checked, not assumed. A future catalogue with duplicates would silently drop rows, which is worth re-checking if the upstream source ever changes.

`SHOLAT_DEFAULT_LOCATION` resolves through this same path for the reminder ticker and the prefetch job. A value that fails to resolve stops reminders with only a log line, so `parseLocationQuery('KAB. BOGOR')` is pinned by a test that says why.

## Alternatives considered

**Exact matching only, no fuzzy.** Simplest rule to state and fully predictable, but it strands 59 working lookups and downgrades 42 candidate lists to not-found. Every location would still be reachable by typing its full name — 517 Indonesian place names is a lot to expect anyone to type exactly.

**Requiring a space after the prefix,** so `kab.bandung` returns a correction. More internally consistent, but it breaks the `kab-bandung` form our own help message advertises.

**Edit-distance suggestions** for typos like `bandunk`. Rejected: a threshold to tune, and a real chance of confidently suggesting the wrong place. Deterministic suggestions or none.

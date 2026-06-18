# ADR 0003: Command grammar — positional verbs, flag options

- **Status:** Accepted
- **Date:** 2026-06-18

## Context

Commands started out with everything as a `--flag`: `#workout --lift`, `#quran --list`, `#sholat --today --location bandung`. That read fine for a handful of commands, but as the modules grew it got muddy — `--lift` (an action) and `--location` (a value) looked identical, and there was no rule for which to reach for next time.

I'd already started moving actions to plain positional tokens (`#workout list`, `#quran mark 145`), and `parseCommand` now flags `--list`, `--leaderboard` and `--mark` as deprecated. But `#sholat` still uses `--today` and `--location`, so the codebase looked half-migrated. Before adding the prayer-reminder toggle I wanted a rule for where each style belongs, so the new command wouldn't add to the confusion.

## Decision

Two roles, two shapes:

- **Verbs (actions) are positional** — the thing you're doing, one per command, right after the namespace: `#workout list`, `#quran mark 145`, `#sholat reminder on`. When the verb is left off, the module picks a sensible default (`#sholat` shows today's times).
- **Options (parameters) are `--flags`** — named data or modifiers that qualify an action: `#sholat --location bandung` carries a value; `#sholat --today` is a combinable modifier (`--today --location bandung`).

The test is "verb or adjective?" `reminder` is something you do, so `#sholat reminder on|off` is positional. `--location` supplies a value, so it stays a flag. Same split as `git commit -m`: positional verb, flagged options.

Under this rule sholat's existing `--today`/`--location` are correct as they are — they're parameters, not actions — so nothing needs migrating. `parseCommand` already supports both: the second token becomes the subcommand unless it starts with `--`, and flags are read off the line with `hasFlag` / `extractFlagValue`.

## Consequences

- There's a clear answer when adding a command: actions go positional, values go behind `--`. The prayer-reminder toggle followed it without inventing anything.
- `#sholat` stops looking like an exception — it's now the documented home for the "parameters are flags" half of the rule.
- The deprecated action-flags (`--list`, `--leaderboard`, `--mark`) still warn, so old muscle memory gets corrected instead of silently failing.

## Alternatives considered

- **All-positional (drop `--location`).** Would mean `#sholat today bandung` and guessing which positional means what. Positional values get ambiguous as soon as there's more than one — which is exactly the job flags do well.
- **All-flags (the original style).** Uniform, but it's the muddle I was trying to leave: no signal in the syntax for "action" versus "value", and it reads less naturally than a verb.

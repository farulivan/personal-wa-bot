# Postmortem: WhatsApp logout crashed the bot and it never came back

**Date:** 2026-07-25
**Duration:** ~most of a day — went down overnight, noticed in the morning, restored that evening
**Severity:** total outage — process dead, no messages processed
**Status:** resolved (manual redeploy + QR re-scan)

## Summary

WhatsApp logged our linked device out. That by itself is a routine, expected event for this kind of bot — but here it took the whole process down with it. When WhatsApp navigates the page to its logout URL, whatsapp-web.js reacts by wiping the saved session and immediately re-running its browser injection. The injection tried to re-register a page binding (`onQRChangedEvent`) that was still registered from the first run, and puppeteer threw `Failed to add page binding ... already exists!`. That throw happens inside an async `framenavigated` handler the library never wraps in try/catch and nobody awaits, so it surfaced as an unhandled rejection and Node exited.

Our app had nothing to catch it: no `unhandledRejection`/`uncaughtException` handler, and the `disconnected` event only logs. So one expected WhatsApp logout became a dead process with no restart and no re-auth. It stayed down until a manual redeploy and QR re-scan that evening.

## Impact

- Bot fully offline from the logout until the manual redeploy — most of a day.
- WhatsApp session wiped by the library's logout handling; one-time QR re-scan required.
- No data loss. Tracking data lives in PostgreSQL and was untouched.

## Timeline (WIB)

Exact timestamps to be filled from Railway logs — grep for `client disconnected` and the crash stack.

- **overnight** — WhatsApp navigates the page to `…post_logout=1`. whatsapp-web.js emits `DISCONNECTED: LOGOUT`, deletes the LocalAuth session, then re-injects. The re-inject throws `Failed to add page binding with name onQRChangedEvent: window['onQRChangedEvent'] already exists!`. Unhandled rejection → `Node.js v20.20.2` fatal exit. Process dead.
- **morning** — Bot noticed down; the crash stack is in the logs. Session already gone.
- **evening** — Redeploy + QR re-scan. Bot back online.

## Root cause

The outage had one external trigger and one real cause.

The trigger was a WhatsApp-initiated logout. whatsapp-web.js drives an unofficial, reverse-engineered web.whatsapp.com session, and WhatsApp can revoke a linked device at any time — after it ships a web update the pinned client can't match, on session expiry, on automation heuristics, or for no visible reason at all. This is normal background noise for this class of bot and is not something we can fully prevent.

The real cause of the _outage_ is that our app is not resilient to it. Two library facts turn a logout into a crash: whatsapp-web.js re-runs `inject()` on every frame navigation (`Client.js`), and its `exposeFunctionIfAbsent` guard (`util/Puppeteer.js`) checks `!!window[name]` in the page — a check that races puppeteer's own binding registry right after a navigation, so it re-exposes a name puppeteer still holds and throws. That throw lives in an un-awaited async handler, so it can only be caught at the process level — and we register no process-level handler, while our `disconnected` handler (`src/bot.ts`) only logs. There was no safety net and no path back.

## What made it harder

- The failure mode is invisible until it happens: an expected logout and a hard crash are the same event here.
- No alerting. The process was simply gone; the outage length was bounded by when someone happened to look, not by any monitor.
- The crash originates two libraries deep (puppeteer, inside whatsapp-web.js's own handler), so it reads like a library bug rather than a gap in our error handling — but the fix is ours to make.

## What went well

- Postgres-backed state meant the worst case was a QR re-scan, not data loss.
- The pasted stack trace pointed straight at the binding conflict, so the root cause was reconstructable from a single log excerpt.

## Notes on the "just upgrade the library" option

Two different versions are easy to confuse:

- **The npm package** `whatsapp-web.js` — latest stable is **1.34.7**; we're on 1.34.6, a one-patch gap (2.0.0 is alpha only). Checked against the v1.34.7 source: `exposeFunctionIfAbsent` still uses the racy `!!window[name]` guard, and `framenavigated` still calls `await this.inject()` with no try/catch. **Upgrading does not fix this.**
- **The WhatsApp Web build** the library loads into the browser (`webVersion` / `webVersionCache`, which defaults to `type: 'local'` with a pinned build). Pinning a fresh known-good build would reduce how often WhatsApp forces a logout, but it's a whatsapp-web.js-specific lever.

Because the process-level fix below is what actually ends the outages — and because it carries over unchanged if we migrate to Baileys later — the library-specific levers (package bump, web-version pin) aren't worth the churn right now.

## Action items

- [ ] Add process-level `unhandledRejection` and `uncaughtException` handlers that log and exit non-zero, so a library throw becomes a controlled restart instead of a silent death. _(see remediation plan)_
- [ ] Make the `disconnected` handler force a clean restart (log reason, exit non-zero) instead of only logging. _(see remediation plan)_
- [ ] Confirm the disconnect reason from Railway logs for this incident (`LOGOUT` vs other) and record it here.
- [ ] (Optional) Add an external uptime check against the existing `/ready` endpoint so the next outage pages someone instead of waiting to be noticed.
- [ ] (Won't do, for now) Bump whatsapp-web.js or pin a fresh `webVersionCache` — verified not to fix this, and likely superseded by a Baileys migration.

---

## Remediation plan (implementation guide)

Scope for the implementer: crash-proof the process and make it self-heal on disconnect. The approach is model-agnostic and Baileys-portable, so it survives a future migration. Detailed enough to implement without further design.

**Conventions to follow** (from `CLAUDE.md`): branch off `main`, one commit per step, Conventional Commits, ESM `.js` import extensions, pino-style logger (`error(obj, msg)` / `log(obj, msg)`). Before each commit run `pnpm format`, then `pnpm verify` and `pnpm test`. Stop after each step and hand back a suggested commit message — do not commit.

**Branch:** `fix/wa-client-resilience`

### Step 1 — Process-level crash guards

File: `src/index.ts`.

Register at the very top of `main()`, before `validateConfig`, so nothing after startup can take the process down silently:

```ts
process.on('unhandledRejection', (reason) => {
  error({ err: reason }, 'unhandled rejection — exiting for restart');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  error({ err }, 'uncaught exception — exiting for restart');
  process.exit(1);
});
```

Why exit rather than swallow: the crashing throw is inside whatsapp-web.js's own async handler; puppeteer/browser state after it is not trustworthy. A clean non-zero exit lets Railway restart from a known-good state. Railway already restarts on exit — the nightly `scheduled-restart` job (`src/index.ts`) depends on exactly that behavior.

**Acceptance:**

- Both handlers log via `error(...)` and exit with code 1.
- Registered before any awaitable startup work in `main()`.

### Step 2 — Restart on disconnect

File: `src/bot.ts`, the `disconnected` handler (currently `client.on('disconnected', (reason) => log({ reason }, 'client disconnected'))`).

Change it to log the reason and force a clean restart:

```ts
client.on('disconnected', (reason) => {
  log({ reason }, 'client disconnected — exiting for restart');
  process.exit(1);
});
```

Notes for the implementer:

- **Do not** call `client.destroy()` here. During a logout, destroy can trigger more navigations → more `inject()` → more throws. Exit and let the platform restart cleanly.
- After restart, LocalAuth restores the session automatically if it's still valid (no QR). If WhatsApp actually logged the device out, the session is gone and the QR prints to logs for a manual scan — that part is inherent to WhatsApp and can't be automated away.
- This errs toward restarting on any disconnect. For a single-instance personal bot that's the right trade: a fast clean restart beats a half-connected client.

**Acceptance:**

- `disconnected` logs `{ reason }` and exits with code 1.

### Step 3 — Tests

Both changes are process-level, which is awkward to unit-test directly. Keep it light and honest:

- Extract the disconnect action into a small pure helper if that makes a test meaningful, e.g. `handleDisconnect(reason, { log, exit })`, and unit-test that it logs the reason and calls `exit(1)`. Colocate as `*.test.ts` per project convention.
- Do not over-mock the whole client. If a clean unit test isn't worth the scaffolding, say so in the PR's Test plan and rely on `pnpm verify` plus the manual check below.

### Step 4 — Manual verification

- `pnpm build && pnpm verify && pnpm test` all green.
- With the bot running locally, drop the WhatsApp connection (log the device out from the phone) and confirm the process logs the reason and exits, and that the supervisor (or Railway) brings it back to a reconnect or QR state.

### PR

Open against `main` with **Summary / Changes / Test plan** sections. Human voice, no AI attribution (repo convention). Link this postmortem.

### Explicitly out of scope

- whatsapp-web.js package upgrade and `webVersionCache` pinning (see "Notes on the just-upgrade option" above).
- Any in-process reconnect / `reinitialize` loop — rejected in favor of exit-to-restart.

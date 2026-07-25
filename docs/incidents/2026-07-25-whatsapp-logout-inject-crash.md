# Postmortem: WhatsApp logout crashed the bot and it never came back

**Date:** 2026-07-25
**Duration:** ~most of a day — crashed mid-morning, restored that evening
**Severity:** total outage — process dead, no messages processed
**Status:** resolved — manual redeploy + QR re-scan restored service; durable fix shipped in [#61](https://github.com/farulivan/personal-wa-bot/pull/61)

## Summary

WhatsApp logged our linked device out. That by itself is a routine, expected event for this kind of bot — but here it took the whole process down with it. When WhatsApp navigates the page to its logout URL, whatsapp-web.js reacts by wiping the saved session and immediately re-running its browser injection. The injection tried to re-register a page binding (`onQRChangedEvent`) that was still registered from the first run, and puppeteer threw `Failed to add page binding ... already exists!`. That throw happens inside an async `framenavigated` handler the library never wraps in try/catch and nobody awaits, so it surfaced as an unhandled rejection and Node exited.

Our app had nothing to catch it: no `unhandledRejection`/`uncaughtException` handler, and the `disconnected` event only logs. So one expected WhatsApp logout became a dead process with no restart and no re-auth. It stayed down until a manual redeploy and QR re-scan that evening.

## Impact

- Bot fully offline from the logout until the manual redeploy — most of a day.
- WhatsApp session wiped by the library's logout handling; one-time QR re-scan required.
- No data loss. Tracking data lives in PostgreSQL and was untouched.

## Timeline (WIB)

Times in WIB (UTC+7).

- **09:33** (`02:33:38Z`) — WhatsApp navigates the page to `…post_logout=1`. whatsapp-web.js emits `DISCONNECTED: LOGOUT` (confirmed in the Railway logs, `reason: "LOGOUT"`), deletes the LocalAuth session, then re-injects. The re-inject throws `Failed to add page binding with name onQRChangedEvent: window['onQRChangedEvent'] already exists!`. Unhandled rejection → `Node.js v20.20.2` fatal exit. Process dead.
- **daytime** — Bot noticed down; the crash stack is in the logs. Session already gone.
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

## Why we didn't "just upgrade the library"

Two different versions are easy to confuse:

- **The npm package** `whatsapp-web.js` — latest stable is **1.34.7**; we're on 1.34.6, a one-patch gap (2.0.0 is alpha only). Checked against the v1.34.7 source: `exposeFunctionIfAbsent` still uses the racy `!!window[name]` guard, and `framenavigated` still calls `await this.inject()` with no try/catch. **Upgrading does not fix this.**
- **The WhatsApp Web build** the library loads into the browser (`webVersion` / `webVersionCache`, which defaults to `type: 'local'` with a pinned build). Pinning a fresh known-good build would reduce how often WhatsApp forces a logout, but it's a whatsapp-web.js-specific lever.

The fix that actually ends the outages is process-level, not library-specific — and it carries over unchanged if we migrate to Baileys later. So the library levers (package bump, web-version pin) aren't worth the churn right now.

## The fix

Rather than fight the library's un-catchable throw, we treat a crash or a disconnect as a signal to restart cleanly and let the platform bring us back:

- Process-level `unhandledRejection` and `uncaughtException` handlers log the error and exit non-zero, so a library throw becomes a controlled restart instead of a silent death.
- The `disconnected` handler now does the same — log the reason, exit for a clean restart — instead of only logging.

On restart, LocalAuth reconnects automatically if the session is still valid (no QR); on a real logout the QR prints to logs for a one-time scan. Railway already restarts the service on exit, which the nightly `scheduled-restart` job also relies on. The approach is library-agnostic, so it survives a future Baileys migration. Shipped in [#61](https://github.com/farulivan/personal-wa-bot/pull/61) (`src/processGuards.ts` plus wiring in `src/index.ts` and `src/bot.ts`).

## Action items

- [x] Process-level `unhandledRejection` and `uncaughtException` handlers that log and exit non-zero, so a library throw becomes a controlled restart instead of a silent death — shipped in [#61](https://github.com/farulivan/personal-wa-bot/pull/61).
- [x] `disconnected` handler forces a clean restart instead of only logging — shipped in [#61](https://github.com/farulivan/personal-wa-bot/pull/61).
- [x] Confirmed the disconnect reason from Railway logs — `reason: "LOGOUT"` at 02:33:38Z, matching the `post_logout` path above.
- [ ] (Optional) Add an external uptime check against the existing `/ready` endpoint so the next outage pages someone instead of waiting to be noticed.
- [x] Decided against bumping whatsapp-web.js or pinning `webVersionCache` — verified neither fixes this, and likely superseded by a Baileys migration.

# Postmortem: Chromium launch failure after image rebuild

**Date:** 2026-07-08
**Duration:** ~1.5 hours of bot downtime (single-instance personal bot)
**Severity:** total outage — bot offline, no messages processed
**Status:** resolved

## Summary

Deploying the memory-footprint branch ([#54](https://github.com/farulivan/personal-wa-bot/pull/54)) triggered the first image rebuild in a while. The rebuild pulled Debian's latest chromium (150), seven major versions past what puppeteer-core 24.35 supports, and the browser stopped launching. Fixing that by pinning Chrome to a supported version exposed a second failure: one of the chromium 150 attempts had gotten far enough to upgrade the persistent browser profile on the Railway volume to 150's data format, which the pinned Chrome 143 could not read. Resetting the profile and re-linking the device restored service.

The new launch flags and the scheduled-restart feature in the same deploy were investigated and cleared — neither contributed.

## Impact

- Bot fully offline from the branch deploy until the session reset.
- WhatsApp session lost; one-time QR re-scan required.
- No data loss. Tracking data lives in PostgreSQL and was untouched.

## Timeline (WIB)

- **~13:50** — Branch deployed to Railway. Image rebuild pulls chromium 150 from Debian repos. Bot fails to start: `Failed to launch the browser process` with dbus errors in stderr.
- **~14:00** — Investigation starts. dbus lines identified as container noise, not the failure. Local bisect of old vs new launch flags in the rebuilt image: the pre-existing flag set fails identically, ruling the new flags out and pointing at the chromium version.
- **~14:30** — Dockerfile fix pushed: pinned Chrome for Testing 143.0.7499.192 (the version puppeteer-core 24.35 expects) on amd64, replacing the floating apt package. Verified locally in an amd64 image: bare launch and every flag combination start cleanly.
- **~14:45** — Redeploy. New failure: `Protocol error (Target.setAutoAttach): Target closed` — Chrome now launches but dies opening the existing profile.
- **~15:00** — Fresh-profile runs of the same image work locally, isolating the persistent volume as the differential. `Last Version` on the prod volume reads 150.x: a chromium 150 attempt had partially started and upgraded the profile before dying.
- **~15:15** — Profile directory renamed aside on the volume (`session` → `session.bak`), service restarted, device re-linked via QR. Bot back online.

## Root cause

The browser binary was an unpinned moving dependency. `apt-get install chromium` installs whatever Debian ships on build day, while puppeteer-core silently assumes a version it was released against. Nothing tied the two together, so a routine rebuild jumped from a working browser to an unsupported one.

A latent second problem turned one incident into two: the Chrome profile on the persistent volume is shared across whatever browser version happens to run, with no guard against a newer version writing data an older one cannot read. Chrome upgrades profiles forward automatically but does not support downgrades; the brief partial start of chromium 150 was enough to strand the profile.

Notably, the failure had nothing to do with the changes being deployed. Any deploy that rebuilt the image would have hit it — this branch just happened to be the first rebuild since Debian rolled chromium past puppeteer's supported range.

## What made it harder

- Chromium's stderr under puppeteer is dominated by harmless container noise (dbus, crashpad), and the real crash left no log line at all. The first error surfaced as `Code: null`.
- Two failures with different causes presented back-to-back on the same deploy, which made the first fix look wrong when the second error appeared.
- The bot never logged which browser binary and version it was actually running, so the version jump was invisible until reproduced locally.

## What went well

- Local reproduction inside the production Dockerfile image made bisecting cheap and conclusive — the flag hypothesis died in one test matrix instead of surviving as a guess.
- The profile reset was done as a reversible rename with the old directory kept as a backup, so a wrong hypothesis would have cost nothing.
- Postgres-backed state meant the worst-case loss was a QR re-scan, not data.

## Action items

- [x] Pin the browser to the puppeteer-supported version (`CHROME_VERSION` build arg in the Dockerfile), with a comment on how to find the matching version when whatsapp-web.js is updated.
- [x] Log the browser executable path and version at startup, so a version change shows up in deploy logs instead of requiring local forensics.
- [x] Assert the browser executes during the image build (`RUN chromium --version`), so a missing or broken browser fails the build instead of the deploy.
- [ ] Guard the profile at startup: if `session/Last Version` on the volume is newer than the pinned Chrome, fail with an explicit message (or reset the profile deliberately) instead of crashing with a protocol error.
- [ ] Delete `session.bak` from the Railway volume once the bot has been stable for a few days.

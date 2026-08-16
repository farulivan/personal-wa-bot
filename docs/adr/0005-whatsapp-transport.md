# ADR 0005: Baileys as the WhatsApp transport

- **Status:** Accepted
- **Date:** 2026-08-14

## Context

The bot idled at roughly 0.75–0.85 GB RSS around the clock, and about three quarters of that was the headless Chromium whatsapp-web.js drives. That is steady-state cost, not a leak: the memory graph after a restart returns to baseline within a few hours. On Railway's GB-minute billing it came to 32–36k GB-min a month for a family habit tracker.

We had already spent the cheap options. Leaner Chromium launch flags and a nightly restart (PR #54) bought 15–25% and capped out there, because the footprint is the price of running WhatsApp Web in a browser at all.

The browser was also the source of both outages we have had. In July 2026 a rebuilt image pulled a Chromium seven majors newer than puppeteer-core supported, and a partial start upgraded the browser profile on the Railway volume to a format the pinned build could not read. Two weeks later a WhatsApp-initiated logout made whatsapp-web.js re-run its page injection, which threw from an un-awaited handler and killed the process for most of a day. Neither failure is possible without a browser.

The official Cloud API would remove the ban risk that comes with any unofficial client, but it has no group messaging at all. This bot is group-shaped — digests, leaderboards, prayer reminders, `@`-mentions in the family group — so it is disqualified on requirements rather than on preference.

## Decision

Replace whatsapp-web.js with **Baileys** (`@whiskeysockets/baileys`), which speaks the WhatsApp multi-device protocol over a plain WebSocket. Pinned to `7.0.0-rc14`.

Choosing a release candidate deserves its own justification. The alternative was `6.7.24`, on the `legacy` dist-tag. We checked both: 7.x's `whatsapp-rust-bridge` turns out to be **WASM, not a native binary** — about 2 MB, prebuilt, no platform gating, no toolchain — so it does not reintroduce the class of problem that caused the Chromium outage. Meanwhile 6.7.x pulls `libsignal` from a git URL, which would have forced `git` into the build image. 7.x is both the easier install and the line that will still be maintained, and taking it now avoids a second migration later.

Supporting decisions:

- **Session storage** stays on the Railway volume via `useMultiFileAuthState`, in `baileys_auth` — a *sibling* of the old whatsapp-web.js profile, never replacing it. (On Railway that profile lived at `<volume>/session`; `.wwebjs_auth` is the local-development path only.) This is load-bearing, not just convenient: v7 requires the auth state to support three new key types (`lid-mapping`, `device-list`, `tctoken`), and the built-in store handles them. **Any future move to a Postgres-backed key store must implement all three**, or LID resolution breaks in ways that are quiet rather than loud.
- **No transport feature flag.** A flag would keep both libraries in the image, so none of the memory win would be realised until it was removed. Rollback is repointing Railway at `main` instead.
- **Reconnects are handled in-process**, on a bounded ladder, rather than by exiting on every disconnect.

## Consequences

The image drops from roughly 1.2 GB to roughly 250 MB and the Node heap cap from 384 to 256 MB. Chromium version pinning, the browser profile on the volume, and the puppeteer contract all stop existing.

**Identity is where the risk concentrated.** WhatsApp addresses a message either by phone number or by LID and supplies the other form alongside. In Baileys 7.x that arrives as `participantAlt`/`remoteJidAlt` plus `addressingMode`; 6.x had named `senderPn`/`participantPn` fields, so any 6.x-era example reads as `undefined` against 7.x. Getting it wrong is silent: it produces a different id for the same person, which forks their history and makes the allowlist reject them.

The rule is: **use the form WhatsApp addressed the sender by**, not the phone number. whatsapp-web.js passed `msg.author` straight through, so `users.id` holds whatever WhatsApp used — and for these chats that is the LID, not the phone number. The evidence was in the code all along: the original `normalizeUserId` stripped `@lid`, which it would only need to do if LIDs were already arriving. `phone_number` is separate metadata from the address book and does not match `id`.

We got this backwards at first, on the assumption that `ALLOWED_NUMBERS` held phone numbers. It does not — it holds WA IDs. Checking the actual table before cutover is what caught it; had it shipped, the allowlist would have rejected every member and every history would have looked empty. **Verify against the data, not against what the column is named.**

Because a chat can flip between phone-number and LID addressing as WhatsApp migrates, `IncomingMessage` also carries `senderCandidates` — every form the sender is known by — and identity checks match on any of them. Both forms belong to the same WhatsApp account, so this is not a widening of the allowlist.

Group metadata is the first source for a member's LID, but it does not always carry one. Baileys keeps its own PN↔LID mapping at `sock.signalRepository.lidMapping`, and we fall back to it before dropping a mention.

One thing improves for free: v7 stops sending message delivery acknowledgments, which WhatsApp has been banning accounts for. That is a reduction in the ban risk we are carrying, not just a neutral change.

**In-process reconnects opened a hole the old design did not have.** `claimDueReminders` stamps `sent_at` before sending and never retries (ADR 0001), so a reminder claimed during a reconnect window would be destroyed rather than deferred. Both tickers now skip while the socket is down. The sholat ticker needed the same guard, since it marks a prayer fired before delivering it.

Accepted losses, none of which change observable behaviour much:

- No address book, so `contactName` is no longer captured for new users. Display names already prefer the sender's own profile name, so they are unaffected.
- In a LID-addressed group that withholds the phone number, a new user is captured without one and appears in digests by name instead of as an `@`-mention.
- No message store, so a peer's retry request cannot be served and a recipient may rarely see "waiting for this message".
- Replies are no longer quoted. The primary path never quoted them anyway.

The nightly restart survives, but its stated reason does not — it was there to cap Chromium's memory creep. It is now the coarse backstop for a socket wedged in a way the reconnect ladder cannot see, and worth reconsidering once the ladder has proven itself.

The ban risk is unchanged: Baileys is as unofficial as whatsapp-web.js. That is not a regression, but it is not an improvement either.

## Runbook notes

**Never call `sock.logout()`.** It unlinks the Baileys device and forces a QR re-scan, and it is exactly the kind of call that ends up in a cleanup script. Ending the socket (`sock.end`) is the correct way to disconnect.

**On rollback.** Scanning the Baileys QR linked a *new* device rather than unlinking the whatsapp-web.js one, so during the migration a rollback cost nothing: the old session was still on the volume and still valid. That property expired on 2026-08-16, when `<volume>/session` and `<volume>/session.bak` were deleted — which is expected and fine, since it existed to de-risk a cutover that is over. A rollback now costs a QR re-scan.

Since the migration merged to `main` on 2026-08-15, rolling back means reverting the merge or redeploying an older image, and it costs a QR re-scan. There is still no data migration in either direction.

There is no schema change either way — the migration adds no tables and no columns, so there is nothing to apply going forward and nothing to undo coming back.

### A soak-window restriction, now lifted

**Resolved 2026-08-15**, when the migration merged to `main`. Recorded because the reasoning explains a real asymmetry in the stored data, not because the rule still applies.

During the soak we kept `#remind` and `#sholat reminder on` to group chats.

The two columns that persist a chat id — `reminders.target_chat_id` and `sholat_reminder_settings.chat_id` — hold whatever the transport calls the chat. Groups are `@g.us` under both libraries, so they are byte-identical and safe. Direct messages are not: whatsapp-web.js writes `@c.us`, Baileys writes `@s.whatsapp.net`.

That difference only bites in one direction. Baileys reads the old `@c.us` rows fine, because `toSendJid` coerces them; whatsapp-web.js cannot read `@s.whatsapp.net`. So a DM row written during the soak would have failed to send **if we had rolled back** — and avoiding DM scheduling for a few days was cheaper than carrying a compatibility shim for a window we expected to close.

Rollback is no longer a consideration, so DM scheduling is unrestricted. The asymmetry itself still stands and is worth remembering: any future transport that changes how a DM chat id is spelled has the same problem, and `toSendJid` is where it gets handled.

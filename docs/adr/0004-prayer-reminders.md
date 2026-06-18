# ADR 0004: Prayer-time reminders — daily prefetch and a read-only ticker

- **Status:** Accepted
- **Date:** 2026-06-18

## Context

`#sholat` already fetches the day's prayer times and caches them per location per day. The natural next step was to push a nudge into the chat when each prayer comes in, instead of making someone ask. A few things shaped how:

- Prayer times are **dynamic** — different every day, and not on round minutes (Dzuhur might be 11:57). The existing digest scheduler fires at a fixed `(hour, minute)`, so it can't express them.
- The upstream API (myQuran) should be hit **at most once a day**, the same as the on-demand command. Reminders mustn't turn into a polling hammer.
- It needs a per-chat on/off switch, and it should work in a DM as well as the family group.

## Decision

Two moving parts, both modelled on things already in the codebase.

**A daily prefetch job** warms today's schedule into the DB cache at 00:05 local, with bounded retry — up to three attempts, each failure logged, then it gives up for the day. It reuses `getTodaySchedule`, so the once-a-day caching is unchanged. This is the *only* place that talks to the API for reminders.

**A read-only ticker** runs every 30 seconds (like the reminder scheduler), reads today's schedule from the cache, and when the current minute matches a fardhu time it sends to every enabled chat. It never calls the API — a cold cache just logs and skips. Keeping all fetching in the job is what keeps the retry bounded: a ticker that fetched on a cold cache would retry the API every minute during an outage.

Fetching is **date-explicit**. The schedule is requested as `/jadwal/{id}/{YYYY-MM-DD}` for the date computed in the sholat timezone, not the `/today` endpoint. `/today` derives "today" from the server clock and ignores the `tz` query, so between local midnight and ~07:00 it can return yesterday's schedule — right when the prefetch and the Subuh reminder need today's.

Which chats get reminders is a **per-chat toggle** in `sholat_reminder_settings`. Anyone allowed can switch it on in their own DM; in a group, only the configured main group (`DIGEST_GROUP_ID`) may, so a random group can't opt the bot in. De-duplication is in memory — a `Set` of `prayer:date` keys, cleared when the day rolls over.

## Consequences

- One API call a day for reminders, served from the same cache as `#sholat`. No new infrastructure.
- A restart re-reads the cache and carries on. The cost is that the in-memory dedup resets, so a restart landing on the exact minute of a prayer could send it twice — a rare duplicate, which for a prayer nudge is harmless. Same reasoning as [ADR 0001](0001-reminder-delivery-semantics.md): a once-in-a-blue-moon duplicate beats the machinery to prevent it.
- If the prefetch exhausts its retries, that day's reminders are skipped and logged, rather than sent late or wrong.
- Every chat shares the one default location for now. Per-chat location is a planned follow-up; the toggle row is the natural place to hang it.

## Alternatives considered

- **Reuse the fixed-time digest scheduler.** Can't — prayer times move daily, and a `(hour, minute)` job is static. Regenerating jobs every midnight would mean tearing the scheduler down and rebuilding it daily for no real gain over a small ticker.
- **Let the ticker fetch on a cold cache.** Simpler to wire, but an outage would have it hitting the API every minute. Putting all fetching in the once-a-day job is what makes "bounded retry" actually true.
- **Persisted dedup (a `last_sent` column).** Closes the restart-duplicate window, but it's a write on every send and a column to maintain. Not worth it for a nudge; worth revisiting if a missed-or-doubled reminder ever became costly.
- **The `/today` endpoint.** Less code (no date to compute), but the midnight-boundary staleness makes it the wrong default for an unattended job.

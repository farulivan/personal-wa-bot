# ADR 0004: Prayer-time reminders — cache-aside warming and a delivery ticker

- **Status:** Accepted
- **Date:** 2026-06-18

## Context

`#sholat` already fetches the day's prayer times and caches them per location per day. The natural next step was to push a nudge into the chat when each prayer comes in, instead of making someone ask. A few things shaped how:

- Prayer times are **dynamic** — different every day, and not on round minutes (Dzuhur might be 11:57). The existing digest scheduler fires at a fixed `(hour, minute)`, so it can't express them.
- The upstream API (myQuran) should be hit **at most once a day**, the same as the on-demand command. Reminders mustn't turn into a polling hammer.
- It needs a per-chat on/off switch, and it should work in a DM as well as the family group.

## Decision

One moving part, modelled on the existing reminder scheduler.

**A ticker** runs every 30 seconds. Each tick it checks who's opted in, reads today's schedule from the DB cache, and when the current minute matches a fardhu time it sends to every enabled chat.

The cache is filled **cache-aside**: the ticker reads it, and on a miss it kicks off a warm in the background — `getTodaySchedule`, which fetches once and stores — instead of blocking the tick. So whoever needs the schedule first that day populates it: at 00:00 when the day rolls over, or right after a restart at any hour. That's what makes reminders survive a mid-day deploy, which a fixed-time prefetch job can't.

The warm is **bounded and throttled** so a cache miss during an upstream outage doesn't become a per-minute hammer: three attempts per warm (each failure logged), only one warm in flight at a time, and at most one warm every 15 minutes while the cache stays cold. Once it's warm the ticker just reads — one API call a day in steady state. A warm only happens when at least one chat is opted in, so an unused feature costs nothing.

Fetching is **date-explicit**. The schedule is requested as `/jadwal/{id}/{YYYY-MM-DD}` for the date computed in the sholat timezone, not the `/today` endpoint. `/today` derives "today" from the server clock and ignores the `tz` query, so between local midnight and ~07:00 it can return yesterday's schedule — right when the first warm and the Subuh reminder need today's.

Which chats get reminders is a **per-chat toggle** in `sholat_reminder_settings`. Anyone allowed can switch it on in their own DM; in a group, only a configured group (one listed in `DIGEST_GROUP_IDS`) may, so a random group can't opt the bot in. De-duplication is in memory — a `Set` of `prayer:date` keys, cleared when the day rolls over.

## Consequences

- One API call a day for reminders in steady state, served from the same cache as `#sholat`. No new infrastructure.
- Reminders survive a restart at any time of day: the next tick finds a cold cache, warms it, and resumes from the next prayer. A fixed-time prefetch can't do this — if the process is down at its scheduled minute, the whole day is lost.
- During an upstream outage the warm keeps retrying — bounded to one burst every 15 minutes — and picks up on its own once the API recovers, rather than waiting for the next day.
- A restart re-reads the cache and carries on, but the in-memory dedup resets, so a restart landing on the exact minute of a prayer could send it twice — a rare duplicate, harmless for a nudge. Same reasoning as [ADR 0001](0001-reminder-delivery-semantics.md): a once-in-a-blue-moon duplicate beats the machinery to prevent it.
- Every chat shares the one default location for now. Per-chat location is a planned follow-up; the toggle row is the natural place to hang it.

## Alternatives considered

- **A fixed-time prefetch job (the first cut of this).** A `ScheduledJob` that warms the cache at 00:05, with a strictly read-only ticker. Clean, but it only warms if the process is alive at 00:05 — a mid-day deploy gets no reminders until the next midnight. Cache-aside in the ticker covers that and the midnight case with one mechanism.
- **An unthrottled fetch on cache miss.** The simplest cache-aside, but during an outage the ticker would hit the API every 30 seconds. The throttle and in-flight guard are what make "fetch on miss" safe.
- **Reuse the fixed-time digest scheduler for the reminders themselves.** Can't — prayer times move daily, and a `(hour, minute)` job is static.
- **Persisted dedup (a `last_sent` column).** Closes the restart-duplicate window, but it's a write on every send and a column to maintain. Not worth it for a nudge; worth revisiting if a missed-or-doubled reminder ever became costly.
- **The `/today` endpoint.** Less code (no date to compute), but the midnight-boundary staleness makes it the wrong default for an unattended warm.

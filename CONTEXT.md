# Context

What this project is, in plain terms, and the words I use for things. If you're picking up the code, read this first, then [the architecture guide](docs/architecture.md).

## The product

A WhatsApp bot my family uses to track daily habits and get reminders. We talk to it with short `#` commands in our normal WhatsApp chats — there's no separate app to open. It tracks workouts, Quran reading, and prayer times, posts a couple of daily and nightly group digests, and delivers personal reminders.

It runs as a single Node process against one PostgreSQL database, deployed on Railway. It talks to WhatsApp over a WebSocket via Baileys — no browser involved (see [ADR 0005](docs/adr/0005-whatsapp-transport.md)).

## The modules

| Module | What it owns |
|---|---|
| `workouts` | Logging lifts and cardio, streaks, the daily leaderboard digest |
| `quran` | Logging pages read, the bookmark, khatam detection, the nightly reminder |
| `sholat` | The daily prayer schedule (cached per location per day) and opt-in prayer-time reminders |
| `remind` | Personal reminders and the scheduler that delivers them |
| `users` | Identity — mapping WhatsApp IDs to people and display names |

## Words I use

- **Streak** — consecutive days a person hit their goal. For workouts, a day only counts once it clears `MIN_WORKOUTS_FOR_STREAK` logs.
- **Khatam** — finishing a full read-through of the Quran (604 pages). When a read crosses page 604, the bookmark resets so the next cycle starts from the beginning.
- **Bookmark / mark** — where someone is up to in the Quran. A read auto-advances it unless `--no-mark` is passed; `#quran mark 145` sets it by hand.
- **Digest** — a scheduled group message. The workout digest is a morning leaderboard; the Quran reminder is a nightly nudge. On the 1st of the month there's a recap of the previous month.
- **Prayer reminder** — an opt-in nudge posted to a chat at each of the five fardhu prayer times, built from the cached `#sholat` schedule. Switched on per chat with `#sholat reminder on`.
- **Leaderboard** — a ranking of the group for the day (or month), built only from people who are actually members of the digest group.
- **WA user ID** — the id WhatsApp addresses someone by, and what we key every row on. WhatsApp uses either a phone number or a **LID** depending on the chat, and ours are LIDs — long numbers with no relation to the person's phone number. `users.id` holds this; `users.phone_number` is separate metadata that does *not* match it.
- **Allowlist** — `ALLOWED_WA_IDS`. Only these WA user IDs can run commands — IDs, not phone numbers. An empty allowlist means nobody can, which is the safe default.
- **Source chat** — where a reminder was created. It's delivered back to that same chat, group or direct, not only to the person who set it.
- **Due / claimed reminder** — a reminder is *due* when `scheduled_at <= now` and it hasn't been sent or deleted. The scheduler *claims* a batch of due reminders atomically before sending them (see [ADR 0001](docs/adr/0001-reminder-delivery-semantics.md)).

## A few invariants worth knowing

- **Time is stored in UTC.** A person's "day" is worked out with `USER_TIMEZONE_OFFSET_MINUTES`, so a log made just before local midnight still lands on the right day. Reminder input is read in that local timezone, then stored as UTC.
- **In groups, the bot stays quiet** unless a message starts with `#` or mentions the bot.
- **Deletes are soft** (`deleted_at`) where undo and history matter, so "undo" and the history views stay honest.
- **A user ID is not a phone number.** Deriving one from the other orphans every existing row and makes the allowlist reject people it used to admit — silently, since nothing errors. `WaUserId` and `PhoneNumber` in `src/shared/identity.ts` are distinct types so the compiler refuses the swap; go through `toWaUserId` / `toPhoneNumber` rather than passing bare strings. Background: [ADR 0005](docs/adr/0005-whatsapp-transport.md).

# Context

What this project is, in plain terms, and the words I use for things. If you're picking up the code, read this first, then [the architecture guide](docs/architecture.md).

## The product

A WhatsApp bot my family uses to track daily habits and get reminders. We talk to it with short `#` commands in our normal WhatsApp chats — there's no separate app to open. It tracks workouts, Quran reading, and prayer times, posts a couple of daily and nightly group digests, and delivers personal reminders.

It runs as a single Node process against one PostgreSQL database, deployed on Railway.

## The modules

| Module | What it owns |
|---|---|
| `workouts` | Logging lifts and cardio, streaks, the daily leaderboard digest |
| `quran` | Logging pages read, the bookmark, khatam detection, the nightly reminder |
| `sholat` | The daily prayer schedule, cached per location per day |
| `remind` | Personal reminders and the scheduler that delivers them |
| `users` | Identity — mapping WhatsApp IDs to people and display names |

## Words I use

- **Streak** — consecutive days a person hit their goal. For workouts, a day only counts once it clears `MIN_WORKOUTS_FOR_STREAK` logs.
- **Khatam** — finishing a full read-through of the Quran (604 pages). When a read crosses page 604, the bookmark resets so the next cycle starts from the beginning.
- **Bookmark / mark** — where someone is up to in the Quran. A read auto-advances it unless `--no-mark` is passed; `#quran mark 145` sets it by hand.
- **Digest** — a scheduled group message. The workout digest is a morning leaderboard; the Quran reminder is a nightly nudge. On the 1st of the month there's a recap of the previous month.
- **Leaderboard** — a ranking of the group for the day (or month), built only from people who are actually members of the digest group.
- **Allowlist** — `ALLOWED_NUMBERS`. Only these phone numbers can run commands. An empty allowlist means nobody can, which is the safe default.
- **Source chat** — where a reminder was created. It's delivered back to that same chat, group or direct, not only to the person who set it.
- **Due / claimed reminder** — a reminder is *due* when `scheduled_at <= now` and it hasn't been sent or deleted. The scheduler *claims* a batch of due reminders atomically before sending them (see [ADR 0001](docs/adr/0001-reminder-delivery-semantics.md)).

## A few invariants worth knowing

- **Time is stored in UTC.** A person's "day" is worked out with `USER_TIMEZONE_OFFSET_MINUTES`, so a log made just before local midnight still lands on the right day. Reminder input is read in that local timezone, then stored as UTC.
- **In groups, the bot stays quiet** unless a message starts with `#` or mentions the bot.
- **Deletes are soft** (`deleted_at`) where undo and history matter, so "undo" and the history views stay honest.

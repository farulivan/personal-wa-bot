<p align="center"><img src="docs/assets/logo.png" alt="personal-wa-bot" height="140"></p>

<h1 align="center">personal-wa-bot</h1>

<p align="center">
  The WhatsApp bot my family actually uses — and a backend built to stay up.
</p>

<p align="center">
  It tracks workouts, Quran reading, and prayer times, and delivers reminders on schedule —<br>
  TypeScript and PostgreSQL behind a hexagonal architecture, with a job scheduler that survives restarts.
</p>

<p align="center">
  <a href="#motivation">Why</a> ·
  <a href="#engineering-highlights">Highlights</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#command-reference">Commands</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#documentation">Docs</a>
</p>

<div align="center">
  
![GitHub Actions](https://img.shields.io/github/actions/workflow/status/farulivan/personal-wa-bot/ci.yml?style=flat-square)
![Tests](https://img.shields.io/badge/tests-366%20passing-brightgreen?style=flat-square)
![License](https://img.shields.io/github/license/farulivan/personal-wa-bot?style=flat-square)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square)
![TypeScript](https://img.shields.io/badge/typescript-5.x-blue?style=flat-square)
  
</div>

---

## Motivation

I wanted to keep track of small daily things — workouts, Quran pages, prayer times — but nothing fit. Notes apps got messy fast: no structure, hard to look back on, easy to forget about. A dedicated tracking app meant another install, another login, and one more thing to remember to open and stay dependent on.

My family already lives in WhatsApp all day, so I put the tracker where we already are. No new app, no new habit, just a few `#` commands in a chat that's always open. That choice set the bar for everything else: it had to be reliable enough to trust with a reminder, and quiet enough to sit in a family group without being annoying.

---

## Engineering Highlights

The interesting part of this project isn't the WhatsApp commands — it's what holds them up.

- **A job scheduler that survives restarts.** Reminders are claimed with a single
  `UPDATE … FOR UPDATE SKIP LOCKED` statement, so a restart never skips a due reminder and overlapping ticks never send one twice. → [`drizzleRemindRepository.ts`](src/modules/remind/infra/drizzleRemindRepository.ts)
- **Hexagonal architecture, applied the same way every time.** Each feature is the
  same shape — parser → service → presenter → repository — and the domain has no idea WhatsApp or PostgreSQL exist. → [`docs/architecture.md`](docs/architecture.md)
- **Wired for real deployment.** Migrations run on boot, a `/ready` endpoint reports
  health, and `SIGTERM` triggers a graceful shutdown that stops the schedulers and closes the DB pool. → [`index.ts`](src/index.ts)
- **366 tests, deterministic on purpose.** Time is injected as `now: () => Date`, so
  the streak math and timezone boundaries are tested against a frozen clock instead of `Date.now()` luck.
- **Errors are typed, not thrown.** A small `Result<T>` carries expected failures
  (bad input, broken rules) back to the caller; exceptions stay reserved for actual bugs. → [`Result<T>`](src/shared/result.ts)

Two of the problems I enjoyed solving:

<details>
<summary><strong>Surviving restarts without dropping reminders</strong></summary>

<br>

A polling scheduler has two ways to embarrass you: skip a reminder because the bot
restarted mid-tick, or fire the same one twice because two ticks overlapped.

I made claiming a single statement —
`UPDATE reminders SET sent_at = now WHERE id IN (SELECT id … FOR UPDATE SKIP LOCKED) RETURNING *`.
The row is marked sent in the very query that selects it, so a restart re-scans only
rows that are genuinely unsent, and two concurrent ticks can't grab the same row.

The catch is that I mark a reminder sent *before* WhatsApp confirms it went out. A
crash in that gap drops one reminder rather than risking a duplicate — at-most-once,
on purpose. For a family reminder bot that's the trade I want; the reasoning is in
[ADR 0001](docs/adr/0001-reminder-delivery-semantics.md).

</details>

<details>
<summary><strong>Why the hexagonal split earned its keep</strong></summary>

<br>

It's a solo project, so the layering had to pay for itself or I'd have dropped it.
Two places where it did:

Adding a feature is mostly mechanical. Every module is the same handful of files, so
building `#remind` was filling in a shape I already knew rather than designing from
scratch. The [architecture guide](docs/architecture.md) walks through adding one end
to end.

Business logic is tested without spinning up WhatsApp or PostgreSQL. Services depend
on repository *interfaces* and a `now()` function, so streak rules and timezone math
run as plain unit tests. The Drizzle and WhatsApp specifics live at the edges, wired
together in the [composition root](src/index.ts) — swapping the database would touch
that file and the `infra/` folders and nothing in the domain.

</details>

<p align="center">
  <img src="docs/assets/demo.gif" alt="WhatsApp chat: showing this month's workout leaderboard" width="1080">
</p>

---

## Usage

### Workout Tracking — `#workout`

Log lift and cardio sessions with compact syntax, track streaks, and get daily group leaderboards.

```
#workout lift push up 20reps 4sets 10kg
#workout cardio run 30min 5km
#workout list
```

- Explicit modes: **lift** and **cardio**
- Configurable streak threshold (`MIN_WORKOUTS_FOR_STREAK`)
- Paginated history with mode badges (`[lift]`, `[cardio]`)
- Daily digest leaderboard in group chat
- Monthly recap: on day 1 of each month, sends the previous month's Workout and Quran leaderboards to `DIGEST_GROUP_ID`
- Undo last workout log within 5 minutes (`#workout undo`)
- Leaderboard preview on demand (`#workout leaderboard`)

### Quran Reading — `#quran`

Track daily pages, manage bookmarks, and get nightly group reminders.

```
#quran read 3
#quran mark 145
#quran list
```

- Auto-accumulate multiple logs per day
- Auto-advance bookmark after each read (skip with `--no-mark`)
- Khatam detection — resets bookmark when passing page 604
- Streak tracking and nightly reminder in group
- Undo today's read within 5 minutes (`#quran undo`)
- Leaderboard preview on demand (`#quran leaderboard`)

### Sholat Schedule — `#sholat`

Fetch daily prayer times with location-aware caching.

```
#sholat --today
#sholat --today --location bandung
```

- DB-cached schedules (fetched once per location per day)
- Self-healing location catalog refresh on stale data

### Personal Reminders — `#remind`

Set reminders with natural date/time input, delivered back to the source chat.

```
#remind tomorrow 9am Review proposal
#remind 2026-03-10 10:30 Submit report
#remind list
```

- Flexible parsing: `today`, `tomorrow`, `YYYY-MM-DD` + `9am`, `HH:MM`, `14`
- Delivered to the same chat (group or direct) where it was created
- Safety limits: 200 char max text, 50 active reminders per user
- Undo last reminder within a short window (`#remind undo`)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20+ · TypeScript 5.x |
| **WhatsApp** | whatsapp-web.js |
| **Database** | PostgreSQL · Drizzle ORM |
| **Testing** | Vitest |
| **Linting** | ESLint · Prettier |
| **Package Manager** | pnpm |

---

## Quick Start

### Prerequisites

- **Node.js** 20+
- **pnpm**
- **PostgreSQL** instance (local or remote)
- Chromium dependencies (OS-dependent, only if running outside Docker)

### Install and run

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env — fill DATABASE_URL and ALLOWED_NUMBERS at minimum

# 3. Build and start
pnpm build
pnpm start
```

On first run, scan the QR code shown in terminal to authenticate your WhatsApp session.

### Docker

```bash
docker compose up --build
```

`docker-compose.yml` mounts `.wwebjs_auth/` for session persistence and `data/` for local storage.

---

## Command Reference

### Workout

| Command | Description |
|---|---|
| `#workout lift push up 20reps 4sets 10kg` | Log a lift session (weight optional) |
| `#workout lift pull up 8rep 5set` | Log bodyweight lift |
| `#workout cardio run 30min 5km` | Log cardio (distance optional) |
| `#workout cardio brisk walk 1hour` | Log cardio with hour unit |
| `#workout list` | View paginated history |
| `#workout list 2` | View page 2 |
| `#workout undo` | Undo your most recent log (within 5 minutes) |
| `#workout leaderboard` | Show today's group leaderboard |
| `#workout help` | Show command help |

**Format rules:** Reps accept `rep`/`reps`, sets accept `set`/`sets`, weight uses `kg` only, duration uses `min`/`hour`, distance uses `km`.

### Quran

| Command | Description |
|---|---|
| `#quran read 3` | Log 3 pages read today |
| `#quran read 3 --no-mark` | Log without advancing bookmark |
| `#quran mark 145` | Set bookmark to page 145 |
| `#quran mark` | Check current bookmark |
| `#quran list` | View paginated reading history |
| `#quran undo` | Undo today's most recent read (within 5 minutes) |
| `#quran leaderboard` | Show today's group leaderboard |
| `#quran help` | Show command help |

### Sholat

| Command | Description |
|---|---|
| `#sholat` / `#sholat --today` | Today's schedule (default location) |
| `#sholat --today --location bandung` | Specify location |
| `#sholat help` | Show command help |

### Remind

| Command | Description |
|---|---|
| `#remind 2026-03-10 10:30 Review proposal` | Set reminder with specific date |
| `#remind today 9am Join standup` | Set reminder for today |
| `#remind tomorrow 8:15 Prepare update` | Set reminder for tomorrow |
| `#remind list` | View active reminders |
| `#remind undo` | Undo last reminder (within a short window) |
| `#remind help` | Show command help |

---

## Configuration

See [`.env.example`](.env.example) for the full template.

<details>
<summary><strong>Required variables</strong></summary>

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection URL |
| `ALLOWED_NUMBERS` | `""` | Comma-separated phone allowlist (digits only, e.g. `6281234567890`) |
| `DIGEST_GROUP_ID` | `""` | Target group for scheduled digests. Scheduler disabled if empty. |
| `DEBUG` | `false` | Enable debug logs (`true`/`1`) |

</details>

<details>
<summary><strong>Scheduling</strong></summary>

| Variable | Default | Description |
|---|---|---|
| `USER_TIMEZONE_OFFSET_MINUTES` | `420` | UTC offset in minutes (UTC+7 = 420) |
| `DAILY_DIGEST_HOUR` | `8` | Workout digest hour (24h, user timezone) |
| `DAILY_DIGEST_MINUTE` | `0` | Workout digest minute |
| `QURAN_REMINDER_HOUR` | `22` | Quran reminder hour (24h, user timezone) |
| `QURAN_REMINDER_MINUTE` | `0` | Quran reminder minute |
| `MONTHLY_DIGEST_HOUR` | `8` | Monthly recap hour (day 1, 24h, user timezone) |
| `MONTHLY_DIGEST_MINUTE` | `0` | Monthly recap minute |

</details>

<details>
<summary><strong>Feature behavior</strong></summary>

| Variable | Default | Description |
|---|---|---|
| `MIN_WORKOUTS_FOR_STREAK` | `3` | Workouts/day to count as a streak day |
| `WORKOUT_LIST_LIMIT` | `10` | Rows per page for `#workout list` |
| `QURAN_LIST_LIMIT` | `10` | Rows per page for `#quran list` |
| `REMIND_LIST_LIMIT` | `10` | Rows per page for `#remind list` |
| `QURAN_RAMADHAN_COUNT_ENABLED` | `false` | Show Ramadhan total in `#quran list` |
| `QURAN_RAMADHAN_START_DATE` | — | Ramadhan start (`YYYY-MM-DD`, inclusive) |
| `QURAN_RAMADHAN_END_DATE` | — | Ramadhan end (`YYYY-MM-DD`, inclusive) |
| `SHOLAT_DEFAULT_LOCATION` | `KAB. BOGOR` | Default prayer schedule location |
| `SHOLAT_TIMEZONE` | `Asia/Jakarta` | IANA timezone for sholat date calc |

</details>

<details>
<summary><strong>Deployment</strong></summary>

| Variable | Default | Description |
|---|---|---|
| `PUPPETEER_EXECUTABLE_PATH` | — | Override Chromium binary path |
| `RAILWAY_VOLUME_MOUNT_PATH` | — | Override WA auth storage path |

</details>

<details>
<summary><strong>Timezone and date logic</strong></summary>

Timestamps are stored in UTC. User-local day boundaries are calculated using `USER_TIMEZONE_OFFSET_MINUTES`.

**Example:** With `USER_TIMEZONE_OFFSET_MINUTES=420` (UTC+7), a log at `2026-02-21T17:30:00Z` becomes local `2026-02-22 00:30` and belongs to **Feb 22**.

Scheduled jobs use the same offset, so digest/reminder timing is always consistent with user-local time. Reminder input (`#remind`) is interpreted in this timezone, then stored as UTC.

**Ramadhan counter:** When `QURAN_RAMADHAN_COUNT_ENABLED=true`, `#quran list` shows a Ramadhan total line. Date range is inclusive on both ends, using user-local day comparison.

</details>

---

## Project Structure

```
src/
├── index.ts              # Composition root — wires all dependencies
├── config/env.ts         # Centralized env parsing
├── app/                  # Application layer (router, handler, auth, scheduler)
├── adapters/whatsapp/    # WhatsApp adapter (ports, gateway, ID helpers)
├── modules/
│   ├── workouts/         # Workout tracking module
│   ├── quran/            # Quran reading module
│   ├── sholat/           # Prayer schedule module
│   ├── remind/           # Reminder module
│   └── users/            # User identity management
├── db/                   # Drizzle connection, migrations, schema aggregator
└── shared/               # Shared utilities (Result type)
```

Each module follows a consistent internal structure:

```
modules/<name>/
├── index.ts              # Registration factory (module's public API)
├── <name>Parser.ts       # Pure input parsing → Result<T>
├── <name>Service.ts      # Business logic (depends on repository interface)
├── <name>Controller.ts   # Thin handler: invocation → service → presenter
├── <name>Presenter.ts    # Pure string formatting
└── infra/
    ├── <name>Repository.ts         # Interface (contract)
    ├── drizzle<Name>Repository.ts  # Implementation (Drizzle queries)
    └── schema.ts                   # Table definition
```

See the [Architecture Guide](docs/architecture.md) for a full walkthrough of how the layers connect and how to add a new module.

---

## Development

```bash
pnpm dev              # TypeScript watch mode
pnpm build            # Compile + copy migrations
pnpm verify           # Type-check + lint (tsc --noEmit && eslint)
pnpm test             # Run unit tests
pnpm lint:fix         # Auto-fix lint issues
pnpm format           # Format with Prettier
```

---

## Internal Behavior

- **Group chats:** bot responds only when mentioned or message starts with `#`.
- **Auth:** only phone numbers in `ALLOWED_NUMBERS` can execute commands.
- **Identity:** user IDs are normalized before persistence to handle WA ID format variations.
- **Remind scheduler:** runs independently after WA client is ready, polls every 30s.
- **Digest/Quran scheduler:** runs only when `DIGEST_GROUP_ID` is configured.

---

## Security

- Keep `.env` out of version control (already in `.gitignore`).
- Restrict access via `ALLOWED_NUMBERS` — no allowlist means no one can use the bot.
- Persist `.wwebjs_auth/` and `data/` in production environments.
- Do not share terminal logs publicly (may contain operational details).

---

## Troubleshooting

<details>
<summary><strong>Bot does not respond</strong></summary>

- Check sender number is in `ALLOWED_NUMBERS`
- In groups, ensure message starts with `#` or bot is mentioned
- Set `DEBUG=true` and inspect logs

</details>

<details>
<summary><strong>Scheduler not running</strong></summary>

- **Digest/Quran jobs:** verify `DIGEST_GROUP_ID` is set and timezone/hour/minute values are correct
- **Reminders:** ensure WA client reached `ready` state; check DB for pending reminders (`sent_at IS NULL`, `scheduled_at <= now`)

</details>

<details>
<summary><strong>Authentication issues</strong></summary>

- Ensure auth path is writable (`.wwebjs_auth/` or `RAILWAY_VOLUME_MOUNT_PATH`)
- Delete auth folder and rescan QR if session is corrupted

</details>

---

## Documentation

| Document | Description |
|---|---|
| [Context & Glossary](CONTEXT.md) | What the project is, the modules, and the domain words it uses |
| [Architecture Guide](docs/architecture.md) | How the codebase is structured, key patterns, and step-by-step guide for adding new features |
| [Architecture Decisions](docs/adr/) | The non-obvious calls — reminder delivery semantics, the hexagonal split — and why |

---

## Contributing

This is a personal project, but issues and pull requests are welcome — bug reports, small fixes, and ideas all help.

**Getting set up**

Follow [Quick Start](#quick-start) to run it locally. For the bigger picture, [CONTEXT.md](CONTEXT.md) explains the domain words and the [Architecture Guide](docs/architecture.md) shows how the modules fit together.

**Making a change**

- Branch off `main` and keep changes focused.
- Follow the existing module shape (parser → service → presenter → repository), and add tests where it makes sense.
- Open a pull request against `main` with a short note on what changed and why.

Before opening a PR, run the same checks CI does:

```bash
pnpm verify   # type-check + lint
pnpm test     # unit tests
```

Adding a new command? The [Architecture Guide](docs/architecture.md#adding-a-new-feature) has a step-by-step walkthrough and a checklist.

---

## License

MIT

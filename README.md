# personal-wa-bot

A TypeScript WhatsApp bot for personal daily tracking and reminders:

- **Workout tracking** (`#workout`)
- **Quran reading tracking** (`#quran`)
- **Sholat schedule lookup** (`#sholat`)
- **Daily scheduled digests** for workout streaks + Quran reminder

---

## 1) Features

### Workout module
- Log workouts with reps/sets/weight
- View paginated history (`#workout --list [page]`)
- Streak tracking with configurable threshold (`MIN_WORKOUTS_FOR_STREAK`)
- Daily digest leaderboard in group

### Quran module
- Log daily pages (`#quran read <pages>` or `#quran log <pages>`)
- Auto-accumulate multiple logs in the same day
- View paginated history (`#quran --list [page]`)
- Total pages read + streak info
- Night reminder in group

### Sholat module
- Fetch and cache daily sholat schedule
- Location resolution with default fallback
- Self-healing location catalog refresh when stale/invalid location ID is detected

---

## 2) Tech stack

- **Node.js + TypeScript**
- **whatsapp-web.js** for WhatsApp integration
- **better-sqlite3** for local persistence
- **pnpm** for package management

---

## 3) Quick start (local)

### Prerequisites
- Node.js 20+
- pnpm
- Chromium dependencies (if running outside Docker, depends on your OS)

### Install
```bash
pnpm install
```

### Configure env
```bash
cp .env.example .env
```

Fill required values in `.env`:
- `ALLOWED_NUMBERS`
- `DIGEST_GROUP_ID` (if you want scheduled digest/reminder)

### Build and run
```bash
pnpm build
pnpm start
```

On first run, scan QR shown in terminal to authenticate WhatsApp session.

---

## 4) Docker

Build and run with compose:

```bash
docker compose up --build
```

`docker-compose.yml` mounts:
- `./.wwebjs_auth` (session persistence)
- `./data` (SQLite persistence)

---

## 5) Environment variables

See `.env.example` for full template.

### Required / strongly advised

| Variable | Required | Default | Description |
|---|---|---:|---|
| `ALLOWED_NUMBERS` | Yes | `""` | Comma-separated allowlist. Only these users can run commands. |
| `DIGEST_GROUP_ID` | Recommended | `""` | Target group for scheduled workout digest + Quran reminder. Scheduler disabled if empty. |
| `DEBUG` | No | `false` | Enable debug logs (`true/1`). |

### Time and scheduling

| Variable | Default | Description |
|---|---:|---|
| `USER_TIMEZONE_OFFSET_MINUTES` | `420` | Main app timezone offset in minutes (UTC+7 = 420). |
| `DAILY_DIGEST_HOUR` | `8` | Workout digest hour (24h, in user timezone). |
| `DAILY_DIGEST_MINUTE` | `0` | Workout digest minute. |
| `QURAN_REMINDER_HOUR` | `22` | Quran reminder hour (24h, in user timezone). |
| `QURAN_REMINDER_MINUTE` | `0` | Quran reminder minute. |

### Feature behavior

| Variable | Default | Description |
|---|---:|---|
| `MIN_WORKOUTS_FOR_STREAK` | `3` | Workouts/day required to count streak day. |
| `WORKOUT_LIST_LIMIT` | `10` | Rows per page for `#workout --list`. |
| `QURAN_LIST_LIMIT` | `10` | Rows per page for `#quran --list`. |
| `SHOLAT_DEFAULT_LOCATION` | `KAB. BOGOR` | Fallback sholat location when not specified. |
| `SHOLAT_TIMEZONE` | `Asia/Jakarta` | IANA timezone for sholat date calculation. |

### Deployment/runtime options

| Variable | Default | Description |
|---|---:|---|
| `PUPPETEER_EXECUTABLE_PATH` | unset | Override Chromium path (often needed on some hosts). |
| `RAILWAY_VOLUME_MOUNT_PATH` | unset | Override LocalAuth data path for persistent WA auth storage. |

---

## 6) Timezone (+7) and date logic

This app stores timestamps in UTC (`ISO`), then calculates user-local day boundaries using:

- `USER_TIMEZONE_OFFSET_MINUTES`
- offset conversion (`utc + offset`) when deciding **Today/Yesterday** and streak days

### Example
If your users are in WIB (UTC+7):
- Set `USER_TIMEZONE_OFFSET_MINUTES=420`
- A log at `2026-02-21T17:30:00.000Z` becomes local `2026-02-22 00:30` and belongs to **Feb 22** local day.

Scheduled jobs also run against this same offset, so digest/reminder timing is consistent with user local time.

---

## 7) Command reference

### Workout
- `#workout` (with multiline payload)
- `#workout --list`
- `#workout --list 2`

Payload format:
```text
#workout
type: push up
reps: 20
sets: 4
weight: 10
```

### Quran
- `#quran read 3`
- `#quran log 3`
- `#quran --list`
- `#quran --list 2`

### Sholat
- `#sholat`
- `#sholat --today`
- `#sholat --today --location kab. bogor`
- `#sholat --today --location bandung`

---

## 8) Internal behavior (important)

- Commands in group chats require bot mention **or** command prefix `#`.
- User identity is normalized before persistence/checking (to avoid WA ID suffix mismatch).
- Scheduled jobs run only when `DIGEST_GROUP_ID` is configured.
- Quran/workout list responses are paginated and controlled by env limits.

---

## 9) Development workflow

```bash
pnpm build
pnpm lint
pnpm format:check
```

Useful scripts:
- `pnpm dev` – TypeScript watch
- `pnpm clean` – remove `dist`

---

## 10) Security and operational notes

- Keep `.env` out of version control.
- Restrict bot usage via `ALLOWED_NUMBERS`.
- Persist `.wwebjs_auth` and `data` in production.
- Avoid sharing terminal logs publicly (may contain operational details).

---

## 11) Troubleshooting

### Bot does not respond
- Check sender number exists in `ALLOWED_NUMBERS`
- Ensure message starts with `#` in groups (or bot is mentioned)
- Enable `DEBUG=true` and inspect logs

### Scheduler not running
- Verify `DIGEST_GROUP_ID` is set
- Confirm `USER_TIMEZONE_OFFSET_MINUTES` and schedule hour/minute values

### Authentication/session issues
- Ensure auth path is writable (`.wwebjs_auth` or `RAILWAY_VOLUME_MOUNT_PATH`)
- Restart and rescan QR if session is invalid

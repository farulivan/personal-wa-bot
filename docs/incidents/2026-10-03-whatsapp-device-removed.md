# Postmortem: WhatsApp removed the bot's linked device and it stayed down overnight

**Date:** 2026-10-03
**Duration:** 19 h 36 min — logged out at 14:28 WIB, linked again at 10:04 the next morning
**Severity:** total outage — bot deaf to every chat, scheduled messages skipped
**Status:** resolved — a QR re-scan restored service; the trigger is narrowed to two candidates and the follow-ups are open

## Summary

On a quiet Saturday afternoon WhatsApp told the bot that its linked device had been removed. Nothing was in flight. The last message had come in three and a half hours earlier.

The bot did what it is built to do with that. It deleted the session that no longer worked, exited, and was back two seconds later asking for a QR code. The uptime monitor saw the outage within three minutes.

Then nothing happened until the next morning. The QR code was scanned at 10:04, nineteen and a half hours later, and everything worked again from that moment.

So there are two questions here. Why WhatsApp removed the device is not settled: two explanations fit, and nothing on our side can tell them apart. Why it cost most of a day is clear. The software can notice a logout and get everything ready for the fix, but the fix itself is a person scanning a code, and nothing made that happen quickly.

## Impact

- Bot offline for 19 h 36 min, from Saturday 14:28 to Sunday 10:04.
- Commands sent in that time were never seen. The logs show no `message received` line for the whole window, and the bot does not read history after a re-link, so nothing was replayed.
- Scheduled messages skipped for both groups: the Quran reminder on Saturday at 22:00 and the workout leaderboard on Sunday at 08:00, plus the prayer reminders that fell in between.
- No personal reminder came due, so none was late.
- No data loss. Everything in PostgreSQL was untouched.

## Timeline (WIB)

Times in WIB (UTC+7), Saturday 3 October into Sunday 4 October.

- **Sat 06:19** (`23:19:07Z`) — Last routine reconnect before the incident, after a 428. The socket opens as device 19 and stays open.
- **Sat 10:58** (`03:58:54Z`) — Last message received. Nothing is logged after it.
- **Sat 14:28:30** (`07:28:30Z`) — WhatsApp sends `<stream:error code="401"><conflict type="device_removed"/></stream:error>`. Baileys maps it to `loggedOut` and the reconnect policy answers "exit, wipe the session". 140 ms later `/data/baileys_auth` is gone and the process has exited with `fatal 401`.
- **Sat 14:28:32** — Railway restarts the process. Migrations run, the health server comes up, and the first QR code is in the logs a second later.
- **Sat 14:30:31** — UptimeRobot's poll of `/ready` gets a 503. The poll at 14:25 had been a 200. Its three retries have all failed by 14:31:16.
- **Sat 14:31 to Sun 10:03** — The bot waits for a scan. Each connection attempt shows six QR codes over 160 seconds, then times out with a 408. After ten retries the reconnect budget is spent, the process exits and Railway starts it again. That happens 36 times, about every 32 minutes, and puts 2,380 QR codes in the logs. The nightly restart at 03:00 fires as usual.
- **Sun 10:04:44** (`03:04:44Z`) — QR code scanned. One `515` restart, which always follows a pairing, then the socket opens as device 20 and the schedulers start.
- **Sun 10:05:31** — `/ready` answers 200 to the monitor.

## Root cause

### The trigger: WhatsApp removed the device

The `device_removed` node is pushed by WhatsApp's servers. Our code cannot produce it. Nothing in `src/` calls `sock.logout()`, and a logout we started ourselves would not come back as a stream error. Feeding the logged node through Baileys' `getErrorCodeFromStreamError` and our `decideReconnect` gives exactly the three log lines the incident produced: the error, the wipe, and the exit with `fatal 401`.

The logs rule out the causes that would have been our fault:

- **Not a second instance.** Two processes sharing one session get `<conflict type="replaced">`, which maps to 440 and is retried. The deployment and replica ids are also the same before and after.
- **Not a flaky connection.** The week before had 28 drops, 17 with code 428 and 11 with 503, and every one healed within three seconds. The last was eight hours before the logout.
- **Not a new link pushing the old one out.** The bot was device 19 before and device 20 after, so nothing else was linked to the account in between.

Nobody removed the device by hand, and the account was not registered again on another phone. That leaves two explanations.

1. **The phone that owns the bot's number went unused for 14 days.** WhatsApp [logs out every linked device](https://faq.whatsapp.com/378279804439436) when that happens, its own clients included. If this is what happened, WhatsApp was last used on that phone around Saturday 19 September.
2. **WhatsApp ended the link itself.** It can do that to any linked device, and an unofficial client is given no reason. The [July 25 logout](2026-07-25-whatsapp-logout-inject-crash.md) was the same kind of event, and other Baileys users report this exact error with no cause found ([Baileys #2203](https://github.com/WhiskeySockets/Baileys/issues/2203)).

I can't tell these apart from here. WhatsApp sends the same node either way. The one local record that might have helped is the session directory, which would have said when device 19 was linked, and that is what the bot deletes on its way out. Railway keeps seven days of logs, which does not reach back far enough either.

The first explanation is the only one I can act on, so it is the one to rule out first. Keep WhatsApp in use on that phone, and if a logout still comes, it was the second.

### The outage: recovery waits for a person

A logout is expected for this kind of bot. Nineteen hours is not, and software spent none of that time. By 14:31 the dead session was gone, a QR code was waiting in the logs and the monitor had raised the alarm.

What was left needs three things in the same place: someone who has seen the alert, the phone that owns the bot's number, and a screen showing the Railway logs. Nothing in the setup pulls those together quickly, and they did not come together until Sunday morning.

## What made it harder

- **Railway shows every log line as `info`.** Pino writes the level as a number (`50` for an error) and Railway only matches the names, so everything is filed under `info`. Baileys logged the `device_removed` node as an error. In Railway it looks like any other line, and a search for `@level:error` across the whole week returns nothing.
- **The logs fill with QR codes.** 2,380 of them at about 30 lines each, wrapped around the handful of lines that matter.
- **The wipe removes the evidence.** Deleting the session is right, because keeping dead credentials would make every restart fail the same way. It also deletes the only record of how old that session was.
- **WhatsApp does not say why.** `device_removed` is the whole message.

## What went well

- **The July fixes held.** The [July 25 outage](2026-07-25-whatsapp-logout-inject-crash.md) was a logout the process could not survive. This time the same event produced a clean exit, a restart two seconds later and a QR code. Nothing crashed and nothing was left half alive.
- **`/ready` told the truth.** It turned 503 as soon as the socket was gone and stayed there, so the monitor had the outage in under three minutes.
- **Nothing was claimed while the bot was down.** The schedulers only start once the socket opens, so no reminder was marked sent without being sent.
- **Re-linking took one scan.** No redeploy, no shell on the volume, no data to repair.
- **The logs were still there.** The whole timeline comes from Railway's deploy and HTTP logs, pulled a day later.

## Action items

- [x] Open WhatsApp on the phone that owns the bot's number at least once a week. That closes the 14-day explanation whether or not it was the cause, and it turns the next logout into evidence for the other one. Acknowledged on 2026-10-04: this is a habit to keep, not a change to ship.
- [x] ~~Make the down alert harder to miss: a push notification or a chat message alongside the email.~~ — **decided against.** The email was enough. I knew about the outage the same day.
- [ ] Stop counting "nobody has scanned yet" as a failure. Waiting for a scan should not spend the reconnect budget and restart the process every half hour. Tracked in [#95](https://github.com/farulivan/personal-wa-bot/issues/95).
- [x] Emit level names from the logger, so Railway can tell an error from an info line. Done for [#93](https://github.com/farulivan/personal-wa-bot/issues/93): pino now writes `error` where it wrote `50`.
- [x] Record when the session was linked, and log its age at boot and at the moment it is wiped, so the next logout comes with a number. Done for [#94](https://github.com/farulivan/personal-wa-bot/issues/94): the link time is read from the credentials, and both `whatsapp socket open` and the wipe line carry it.
- [x] Write down what a logout looks like and how to recover, where someone running the bot will look: the README ([Quick Start](../../README.md#quick-start) and [Troubleshooting](../../README.md#troubleshooting)), the runbook notes in [ADR 0005](../adr/0005-whatsapp-transport.md), the [architecture guide](../architecture.md#boot-sequence) and the glossary in [CONTEXT.md](../../CONTEXT.md).

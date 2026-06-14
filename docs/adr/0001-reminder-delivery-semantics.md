# ADR 0001: At-most-once reminder delivery

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

Reminders live in PostgreSQL and go out via a scheduler that polls every 30 seconds (`src/modules/remind/remindScheduler.ts`). Two things about that setup can go wrong:

1. **The bot restarts.** It runs as a single process on one small instance. It gets redeployed, and once in a while it crashes. A restart can land in the middle of a tick.
2. **Ticks can overlap.** A slow tick — lots of due reminders, a slow WhatsApp send — shouldn't let the next tick grab the same rows and send everything a second time.

So I needed a way to claim due reminders that's safe across restarts and safe against itself. I also didn't want to drag in a job queue or a broker for this: it's a family bot on one box, and running Redis alongside it would be more operational weight than the problem is worth.

## Decision

Claiming due reminders is a single SQL statement (`src/modules/remind/infra/drizzleRemindRepository.ts`):

```sql
UPDATE reminders SET sent_at = $now
WHERE id IN (
  SELECT id FROM reminders
  WHERE sent_at IS NULL AND deleted_at IS NULL AND scheduled_at <= $now
  ORDER BY scheduled_at ASC
  LIMIT $n
  FOR UPDATE SKIP LOCKED
)
RETURNING ...;
```

The row is stamped `sent_at` in the same statement that selects it. `FOR UPDATE SKIP LOCKED` means a second concurrent tick steps over the rows the first one already locked instead of blocking or grabbing them again. The scheduler then sends WhatsApp messages only for the rows it got back from `RETURNING`.

The important part: I stamp `sent_at` at **claim** time, before WhatsApp confirms the message went out. If a send fails, it's logged and not retried.

That makes delivery **at-most-once**.

## Consequences

What this buys:

- A restart never loses track of due reminders. Anything still `sent_at IS NULL` is picked up on the next tick — including reminders that came due while the bot was down. **No skips.**
- Two overlapping ticks can't send the same reminder twice. **No duplicates.**
- No new infrastructure. Postgres was already there.

The trade-off:

- If the process dies (or the WhatsApp send fails) in the gap between claiming a row and sending it, that reminder is **dropped**. It's marked sent but never went out.

I picked at-most-once over at-least-once on purpose. For a family reminder, a rare silently-missed one is annoying. The same reminder showing up two or three times because a retry fired after a crash is worse — it teaches everyone to tune the bot out, which defeats the point of having it.

## Alternatives considered

- **Mark sent only after a confirmed send.** Flips the failure mode to at-least-once: a crash after the message goes out but before the DB write means the next tick re-sends it. Rejected for the duplicate-noise reason above.
- **Two-phase claim (`claimed_at`, then `sent_at`).** Claim the row, send, then stamp sent; a sweeper re-claims anything stuck in `claimed_at` past a timeout. Gets you closer to exactly-once, but it needs a timeout policy and a sweeper job, and it still can't be truly exactly-once against an external service. Not worth the moving parts at this size.
- **A real job queue (Redis + BullMQ or similar).** The right call at higher scale or with multiple senders. Overkill for one process and one family.

If this ever grew past a single node, or the cost of a dropped reminder went up, the two-phase claim is the first thing I'd reach for.

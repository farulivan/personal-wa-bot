# ADR 0002: Hexagonal architecture in a modular monolith

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

This is a solo side project for my family. It's small, but I wanted two things from it: that I could still change it six months later without re-learning the whole thing, and that I could test the logic without standing up WhatsApp and Postgres every time.

The usual way a small side project rots is the opposite of over-engineering — everything in a few big files, business rules tangled up with the WhatsApp client and raw SQL, and no seams to test against. That's comfortable right up until it isn't.

## Decision

I built it as a modular monolith with a hexagonal (ports and adapters) core.

- Each feature — `workouts`, `quran`, `sholat`, `remind`, `users` — is a self-contained module with the same internal shape: a pure parser, a service, a presenter, a controller, and a repository interface with a Drizzle implementation behind it.
- The domain (services, parsers, presenters) only talks to interfaces. A service has no idea WhatsApp or Postgres exist.
- `src/index.ts` is the composition root: the one file that knows the concrete types and wires everything by hand. No DI container, just constructor arguments.
- Expected failures travel as a `Result<T>` (`src/shared/result.ts`) instead of thrown exceptions, so the happy path and the error path are both visible in the types. Exceptions are kept for "something is genuinely broken."
- Every controller is wrapped in `withErrorBoundary`, so a bug in one module returns a friendly message instead of taking the whole bot down.

The full walkthrough, including a step-by-step for adding a module, is in [the architecture guide](../architecture.md).

## Consequences

What this buys:

- Adding a feature is mostly mechanical — copy the shape, fill it in. Less deciding, fewer novel mistakes.
- Business logic is unit-tested with a fake repository and a frozen `now()`, no database or WhatsApp client in sight. That's where most of the 366 tests live.
- Swapping infrastructure stays an edge concern. A different database or chat platform would touch `index.ts` and the `infra/` adapters, not the domain.

The cost:

- More files per feature than the task strictly needs. A "just log a row" feature still gets a parser, a service, a presenter, a controller, and a repository. I decided the consistency and the testability paid for the boilerplate — but at this size that's a real trade, not a free lunch.

## Alternatives considered

- **A flat structure** — handlers calling the database directly. Less code up front, but logic and I/O get braided together and the tests need a real database. Rejected.
- **A batteries-included framework (NestJS and the like).** It would hand me DI and a project layout for free, but it's a lot of framework to wrap around a personal bot, and I wanted the wiring explicit and greppable rather than tucked behind decorators.

export type ReadinessInput = {
  /** Startup finished: the socket opened once and the schedulers are running. */
  hasStarted: boolean;
  /** The socket is open *right now*. */
  isConnected: boolean;
  /** A graceful shutdown is in progress. */
  isShuttingDown: boolean;
};

export type ReadinessResult = {
  status: 200 | 503;
  body: 'READY' | 'NOT_READY';
};

/**
 * Whether `/ready` should report the bot as serving.
 *
 * All three inputs matter. Startup alone is not enough: the socket drops and
 * reconnects as a matter of course, and a readiness check that only remembers
 * "we connected once" keeps reporting READY while the bot is deaf — which is
 * precisely the shape of the 2026-07-25 outage, where the process was alive and
 * nobody was paged.
 *
 * Ordinary reconnects show NOT_READY for a second or two. That is intended:
 * uptime monitors alert on consecutive failures, so a blip is invisible while a
 * socket that never comes back is not.
 */
export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const ready = input.hasStarted && input.isConnected && !input.isShuttingDown;
  return ready ? { status: 200, body: 'READY' } : { status: 503, body: 'NOT_READY' };
}

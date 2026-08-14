import { DisconnectReason } from '@whiskeysockets/baileys';

export type ReconnectDecision =
  | { action: 'reconnect'; delayMs: number; reason: string }
  | { action: 'exit'; wipeAuth: boolean; reason: string };

/** How many consecutive transient failures we ride out before giving up. */
export const MAX_CONSECUTIVE_FAILURES = 10;
/** 515 is expected once per pairing; a run of them means something is stuck. */
export const MAX_CONSECUTIVE_RESTART_REQUIRED = 5;

export type ReconnectInput = {
  /** Boom output.statusCode, or undefined for a plain Error. */
  statusCode: number | undefined;
  /** Reset to 0 whenever the connection reaches 'open'. */
  consecutiveFailures: number;
  consecutiveRestartRequired: number;
};

/**
 * Decides whether a closed socket should be reconnected in-process or should
 * take the process down for the platform to restart.
 *
 * Both extremes are wrong. Exiting on every close makes the 515 that always
 * follows a successful pairing an infinite restart loop, so we could never get
 * past the QR. Never exiting recreates the 2026-07-25 outage: process alive,
 * /ready lying, bot silently dead. So we reconnect on a budget, and let a
 * budget that runs out become a clean non-zero exit.
 */
export function decideReconnect(input: ReconnectInput): ReconnectDecision {
  const { statusCode, consecutiveFailures, consecutiveRestartRequired } = input;

  switch (statusCode) {
    // Reconnecting cannot help: the registration itself is gone. Keeping the
    // dead credentials would guarantee a hot restart loop, so clear them and
    // let the next boot print a QR.
    case DisconnectReason.loggedOut:
    case DisconnectReason.multideviceMismatch:
      return { action: 'exit', wipeAuth: true, reason: `fatal ${statusCode}` };

    // A restricted account is not fixed by a re-scan, and wiping would destroy
    // the evidence of why.
    case DisconnectReason.forbidden:
      return { action: 'exit', wipeAuth: false, reason: 'forbidden 403' };

    // Expected immediately after pairing. Not a failure, so it does not spend
    // the budget — but it gets a cap of its own so a genuine loop still ends.
    case DisconnectReason.restartRequired:
      return consecutiveRestartRequired >= MAX_CONSECUTIVE_RESTART_REQUIRED
        ? { action: 'exit', wipeAuth: false, reason: 'restartRequired loop' }
        : { action: 'reconnect', delayMs: 250, reason: 'restartRequired 515' };

    // 428 connectionClosed, 408 connectionLost/timedOut, 500 badSession,
    // 503 unavailableService, 440 connectionReplaced, and plain Errors.
    //
    // 440 stays here rather than exiting at once so a rolling deploy does not
    // have two containers fighting over the session. 500 stays here too:
    // repeated visible restarts are a better signal to a human than a silent
    // auth wipe and a surprise QR.
    default:
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        return { action: 'exit', wipeAuth: false, reason: `budget exhausted (${statusCode})` };
      }
      return {
        action: 'reconnect',
        delayMs: backoffMs(consecutiveFailures),
        reason: `transient ${statusCode ?? 'unknown'}`,
      };
  }
}

/**
 * 1s, 2s, 4s… capped at 30s, with ±20% jitter so a flapping network does not
 * produce a synchronised reconnect storm.
 */
export function backoffMs(attempt: number, rand: () => number = Math.random): number {
  const base = Math.min(1000 * 2 ** attempt, 30_000);
  return Math.round(base * (0.8 + rand() * 0.4));
}

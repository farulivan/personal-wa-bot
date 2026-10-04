import { DisconnectReason } from '@whiskeysockets/baileys';

/** Which budget a reconnect uses up, if any. */
export type ReconnectBudget = 'failure' | 'restartRequired' | 'none';

/**
 * The pause before asking for a fresh set of QR codes. Short, so whoever opens
 * the logs to scan is not kept waiting, but not zero: an unpaired bot can sit
 * here for hours.
 */
export const SCAN_RETRY_DELAY_MS = 5_000;

export type ReconnectDecision =
  | { action: 'reconnect'; delayMs: number; reason: string; spends: ReconnectBudget }
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
  /**
   * The socket that just closed had put up a QR code: it was unpaired and
   * waiting for someone to scan.
   *
   * This is deliberately not "the session is unpaired". An unpaired socket
   * that times out before any code appears could not reach WhatsApp, and that
   * is a real failure with the same status code.
   */
  awaitingScan: boolean;
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
 *
 * Waiting for a QR scan is the one state the budget does not apply to.
 */
export function decideReconnect(input: ReconnectInput): ReconnectDecision {
  const { statusCode, consecutiveFailures, consecutiveRestartRequired, awaitingScan } = input;

  // Baileys shows six QR codes and then closes with a 408. Nobody scanning is
  // not a failure: the bot is unpaired, and waiting is the only correct thing
  // it can do. Counted as one, it spent the whole budget every half hour on
  // 2026-10-03 and took the process down 36 times for nothing.
  if (awaitingScan && statusCode === DisconnectReason.timedOut) {
    return {
      action: 'reconnect',
      delayMs: SCAN_RETRY_DELAY_MS,
      reason: 'waiting for scan',
      spends: 'none',
    };
  }

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
        : {
            action: 'reconnect',
            delayMs: 250,
            reason: 'restartRequired 515',
            spends: 'restartRequired',
          };

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
        spends: 'failure',
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

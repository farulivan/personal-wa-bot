import { error as rootError, log as rootLog } from './logger.js';

type LoggerFn = (obj: Record<string, unknown>, msg: string) => void;
type ExitFn = (code: number) => never;

export interface RestartDeps {
  error: LoggerFn;
  log: LoggerFn;
  exit: ExitFn;
}

const defaultDeps: RestartDeps = {
  error: rootError,
  log: rootLog,
  exit: process.exit,
};

/**
 * Turn an otherwise-fatal async error into a clean non-zero exit so the
 * platform (Railway) restarts from a known-good state instead of leaving a
 * dead process.
 *
 * This exists because a library once threw inside an un-awaited event handler
 * on logout, which Node surfaced as an unhandledRejection with no local catch
 * point and no restart — the process just died. The transport has changed
 * since, but the class of failure has not: a process-level guard is the only
 * place some async throws can be caught at all.
 *
 * See docs/incidents/2026-07-25-whatsapp-logout-inject-crash.md.
 */
export function crashForRestart(
  label: string,
  err: unknown,
  deps: RestartDeps = defaultDeps
): void {
  deps.error({ err }, `${label} — exiting for restart`);
  deps.exit(1);
}

/** Register the process-level guards. Call once, as early as possible. */
export function installProcessGuards(deps: RestartDeps = defaultDeps): void {
  process.on('unhandledRejection', (reason) =>
    crashForRestart('unhandled rejection', reason, deps)
  );
  process.on('uncaughtException', (err) => crashForRestart('uncaught exception', err, deps));
}

/**
 * The end of the reconnect ladder: called only once the transport has decided
 * a disconnect is not worth retrying in-process. Exit non-zero so the platform
 * restarts cleanly — a still-valid session reconnects with no QR, and a real
 * logout prints one to the logs for a manual scan.
 */
export function handleDisconnect(reason: unknown, deps: RestartDeps = defaultDeps): void {
  deps.log({ reason: String(reason) }, 'client disconnected — exiting for restart');
  deps.exit(1);
}

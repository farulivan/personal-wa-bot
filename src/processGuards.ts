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
 * whatsapp-web.js throws inside un-awaited event handlers — it re-injects on
 * every page navigation, and a logout navigation makes that re-inject fail
 * with "Failed to add page binding ... already exists". Node surfaces it as an
 * unhandledRejection with no local catch point, so the process-level handler
 * is the only place we can react.
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
 * A WhatsApp disconnect (including a logout) is expected background noise for
 * an unofficial client. Exit non-zero so the platform restarts cleanly: on a
 * still-valid session LocalAuth reconnects with no QR; on a real logout the QR
 * prints to logs for a manual scan. We deliberately do not call
 * `client.destroy()` here — during a logout that can drive more navigations,
 * more re-injects, and more throws.
 */
export function handleDisconnect(reason: unknown, deps: RestartDeps = defaultDeps): void {
  deps.log({ reason: String(reason) }, 'client disconnected — exiting for restart');
  deps.exit(1);
}

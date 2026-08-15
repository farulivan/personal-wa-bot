import pino from 'pino';
import crypto from 'crypto';

const level =
  process.env.DEBUG === 'true' || process.env.DEBUG === '1'
    ? 'debug'
    : (process.env.LOG_LEVEL ?? 'info');

export const rootLogger = pino({ level, base: null });

export type RequestLogger = pino.Logger;

export function createRequestLogger(sender: string): RequestLogger {
  const requestId = crypto.randomUUID().slice(0, 8);
  return rootLogger.child({ requestId, sender });
}

/**
 * Two shapes only:
 *   structured — error({ err, chatId }, 'failed to send')
 *   plain      — error('failed to send')
 *
 * There used to be a third, `error('message', err)`, which packed the extras
 * into `{ data: [...] }`. That quietly destroyed every error it was given:
 * pino only runs its error serializer on a top-level `err` key, and an Error's
 * `message` and `stack` are non-enumerable, so the whole thing serialized to
 * `{"data":[{}]}`. Errors are the one thing these helpers exist to record, so
 * the form is gone rather than merely discouraged — pass the error as `err`.
 */
type LogFields = Record<string, unknown>;

function emit(
  write: (fields: LogFields, msg?: string) => void,
  writePlain: (msg: string) => void,
  first: string | LogFields,
  msg?: string
): void {
  if (typeof first === 'string') {
    writePlain(first);
    return;
  }
  write(first, msg);
}

export function debug(first: string | LogFields, msg?: string): void {
  emit(
    (fields, m) => rootLogger.debug(fields, m),
    (m) => rootLogger.debug(m),
    first,
    msg
  );
}

export function log(first: string | LogFields, msg?: string): void {
  emit(
    (fields, m) => rootLogger.info(fields, m),
    (m) => rootLogger.info(m),
    first,
    msg
  );
}

export function error(first: string | LogFields, msg?: string): void {
  emit(
    (fields, m) => rootLogger.error(fields, m),
    (m) => rootLogger.error(m),
    first,
    msg
  );
}

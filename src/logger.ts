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
 * Structured: debug({ key: val }, 'message')
 * Simple:     debug('message')
 * Legacy:     debug('message', extra1, extra2)
 */
export function debug(first: string | Record<string, unknown>, ...rest: unknown[]): void {
  if (typeof first === 'object') {
    rootLogger.debug(first, (rest[0] as string) ?? '');
  } else if (rest.length > 0) {
    rootLogger.debug({ data: rest }, first);
  } else {
    rootLogger.debug(first);
  }
}

export function log(first: string | Record<string, unknown>, ...rest: unknown[]): void {
  if (typeof first === 'object') {
    rootLogger.info(first, (rest[0] as string) ?? '');
  } else if (rest.length > 0) {
    rootLogger.info({ data: rest }, first);
  } else {
    rootLogger.info(first);
  }
}

export function error(first: string | Record<string, unknown>, ...rest: unknown[]): void {
  if (typeof first === 'object') {
    rootLogger.error(first, (rest[0] as string) ?? '');
  } else if (rest.length > 0) {
    rootLogger.error({ data: rest }, first);
  } else {
    rootLogger.error(first);
  }
}

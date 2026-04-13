import pino from 'pino';
import crypto from 'crypto';

const level =
  process.env.DEBUG === 'true' || process.env.DEBUG === '1'
    ? 'debug'
    : (process.env.LOG_LEVEL ?? 'info');

const logger = pino({ level, base: null });

export type RequestLogger = pino.Logger;

export function createRequestLogger(sender: string): RequestLogger {
  const requestId = crypto.randomUUID().slice(0, 8);
  return logger.child({ requestId, sender });
}

export function debug(msg: string, ...args: unknown[]): void {
  if (args.length > 0) {
    logger.debug({ data: args }, msg);
  } else {
    logger.debug(msg);
  }
}

export function log(msg: string, ...args: unknown[]): void {
  if (args.length > 0) {
    logger.info({ data: args }, msg);
  } else {
    logger.info(msg);
  }
}

export function error(msg: string, ...args: unknown[]): void {
  if (args.length > 0) {
    logger.error({ data: args }, msg);
  } else {
    logger.error(msg);
  }
}

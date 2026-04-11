import pino from 'pino';

const level =
  process.env.DEBUG === 'true' || process.env.DEBUG === '1'
    ? 'debug'
    : (process.env.LOG_LEVEL ?? 'info');

const logger = pino({ level, base: null });

export function debug(msg: string, ...args: unknown[]): void {
  if (args.length > 0) {
    logger.debug({ data: args }, msg);
  } else {
    logger.debug(msg);
  }
}

export function debugError(msg: string, ...args: unknown[]): void {
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

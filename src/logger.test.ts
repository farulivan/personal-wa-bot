import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { loggerOptions } from './logger.js';

/**
 * These assert the pino behaviour the logger helpers depend on, rather than the
 * helpers themselves — `rootLogger` binds its destination at import time, so a
 * test cannot capture its output without reaching into module internals.
 *
 * The contract worth pinning: an error only survives serialization when it sits
 * on a top-level `err` key. It used to be passed as `{ data: [err] }`, which
 * silently reduced every production error to `{}` and left the message handler
 * and every command error boundary logging nothing useful.
 */
function captureOne(write: (logger: pino.Logger) => void): Record<string, unknown> {
  const lines: string[] = [];
  const logger = pino(
    { level: 'error', base: null },
    { write: (chunk: string) => void lines.push(chunk) }
  );

  write(logger);

  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]) as Record<string, unknown>;
}

describe('error serialization', () => {
  it('serializes an error passed on the err key', () => {
    const out = captureOne((logger) =>
      logger.error({ err: new Error('connect ECONNREFUSED') }, 'failed to send')
    );

    const err = out.err as Record<string, unknown>;
    expect(out.msg).toBe('failed to send');
    expect(err.type).toBe('Error');
    expect(err.message).toBe('connect ECONNREFUSED');
    expect(String(err.stack)).toContain('connect ECONNREFUSED');
  });

  it('loses everything when the error is nested instead — the regression this guards', () => {
    const out = captureOne((logger) =>
      logger.error({ data: [new Error('connect ECONNREFUSED')] }, 'failed to send')
    );

    // This is what production emitted for every caught error before the fix.
    expect(out.data).toEqual([{}]);
  });

  it('explains why: an Error carries no enumerable own properties', () => {
    const err = new Error('boom');

    expect(Object.keys(err)).toEqual([]);
    expect(JSON.stringify(err)).toBe('{}');
  });

  it('keeps structured context alongside the error', () => {
    const out = captureOne((logger) =>
      logger.error({ err: new Error('boom'), groupChatId: '120@g.us' }, 'failed to send digest')
    );

    expect(out.groupChatId).toBe('120@g.us');
    expect((out.err as Record<string, unknown>).message).toBe('boom');
  });

  it('preserves a cause chain, flattened into the message and stack', () => {
    const out = captureOne((logger) =>
      logger.error({ err: new Error('outer', { cause: new Error('inner') }) }, 'wrapped')
    );

    // pino folds the cause in rather than nesting it under `err.cause`.
    const err = out.err as Record<string, unknown>;
    expect(err.message).toBe('outer: inner');
    expect(String(err.stack)).toContain('caused by: Error: inner');
  });
});

/**
 * Builds a logger from the options production uses, pointed at an array instead
 * of stdout. The threshold is opened up so the quieter levels are captured too.
 */
function captureWithProductionOptions(
  write: (logger: pino.Logger) => void
): Record<string, unknown>[] {
  const lines: string[] = [];
  const logger = pino(
    { ...loggerOptions, level: 'trace' },
    { write: (chunk: string) => void lines.push(chunk) }
  );

  write(logger);

  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('level names', () => {
  it('writes the level as its name, which is what Railway matches on', () => {
    const out = captureWithProductionOptions((logger) => {
      logger.debug('a debug line');
      logger.info('an info line');
      logger.warn('a warning');
      logger.error('an error');
    });

    expect(out.map((line) => line.level)).toEqual(['debug', 'info', 'warn', 'error']);
  });

  it('keeps the name on a child logger, which is how Baileys logs', () => {
    // The same child the transport hands to Baileys, logging the line that
    // explained the 2026-10-03 outage and was filed as info.
    const [line] = captureWithProductionOptions((logger) =>
      logger
        .child({ component: 'baileys' }, { level: 'warn' })
        .error({ reasonNode: { tag: 'conflict' } }, 'stream errored out')
    );

    expect(line.level).toBe('error');
    expect(line.component).toBe('baileys');
    expect(line.msg).toBe('stream errored out');
  });
});

import { describe, it, expect } from 'vitest';
import { evaluateReadiness } from './readiness.js';

const base = { hasStarted: true, isConnected: true, isShuttingDown: false };

describe('evaluateReadiness', () => {
  it('is ready once started and connected', () => {
    expect(evaluateReadiness(base)).toEqual({ status: 200, body: 'READY' });
  });

  it('is not ready before the first connection', () => {
    expect(evaluateReadiness({ ...base, hasStarted: false })).toEqual({
      status: 503,
      body: 'NOT_READY',
    });
  });

  it('is not ready while the socket is down, even after a successful start', () => {
    // The bug this replaces: "we connected once" stayed true through a wedged
    // socket, so /ready reported READY while the bot could not receive anything.
    expect(evaluateReadiness({ ...base, isConnected: false })).toEqual({
      status: 503,
      body: 'NOT_READY',
    });
  });

  it('is not ready during a graceful shutdown', () => {
    expect(evaluateReadiness({ ...base, isShuttingDown: true })).toEqual({
      status: 503,
      body: 'NOT_READY',
    });
  });

  it('reports not ready when nothing is up at all', () => {
    expect(
      evaluateReadiness({ hasStarted: false, isConnected: false, isShuttingDown: true })
    ).toEqual({ status: 503, body: 'NOT_READY' });
  });
});

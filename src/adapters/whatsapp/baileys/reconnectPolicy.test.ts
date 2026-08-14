import { describe, it, expect } from 'vitest';
import { DisconnectReason } from '@whiskeysockets/baileys';
import {
  backoffMs,
  decideReconnect,
  MAX_CONSECUTIVE_FAILURES,
  MAX_CONSECUTIVE_RESTART_REQUIRED,
} from './reconnectPolicy.js';

function decide(statusCode: number | undefined, failures = 0, restarts = 0) {
  return decideReconnect({
    statusCode,
    consecutiveFailures: failures,
    consecutiveRestartRequired: restarts,
  });
}

describe('decideReconnect — fatal codes', () => {
  it('exits and wipes auth on loggedOut (401)', () => {
    expect(decide(DisconnectReason.loggedOut)).toEqual({
      action: 'exit',
      wipeAuth: true,
      reason: 'fatal 401',
    });
  });

  it('exits and wipes auth on multideviceMismatch (411)', () => {
    expect(decide(DisconnectReason.multideviceMismatch)).toMatchObject({
      action: 'exit',
      wipeAuth: true,
    });
  });

  it('exits without wiping on forbidden (403), to preserve the evidence', () => {
    expect(decide(DisconnectReason.forbidden)).toEqual({
      action: 'exit',
      wipeAuth: false,
      reason: 'forbidden 403',
    });
  });

  it('ignores the failure budget for fatal codes', () => {
    expect(decide(DisconnectReason.loggedOut, MAX_CONSECUTIVE_FAILURES + 5)).toMatchObject({
      action: 'exit',
      wipeAuth: true,
    });
  });
});

describe('decideReconnect — restartRequired (515)', () => {
  it('reconnects almost immediately, because 515 always follows pairing', () => {
    expect(decide(DisconnectReason.restartRequired)).toEqual({
      action: 'reconnect',
      delayMs: 250,
      reason: 'restartRequired 515',
    });
  });

  it('does not spend the ordinary failure budget', () => {
    expect(decide(DisconnectReason.restartRequired, MAX_CONSECUTIVE_FAILURES + 5)).toMatchObject({
      action: 'reconnect',
      delayMs: 250,
    });
  });

  it('keeps reconnecting up to its own cap', () => {
    expect(
      decide(DisconnectReason.restartRequired, 0, MAX_CONSECUTIVE_RESTART_REQUIRED - 1)
    ).toMatchObject({ action: 'reconnect' });
  });

  it('exits once 515 repeats past its cap', () => {
    expect(decide(DisconnectReason.restartRequired, 0, MAX_CONSECUTIVE_RESTART_REQUIRED)).toEqual({
      action: 'exit',
      wipeAuth: false,
      reason: 'restartRequired loop',
    });
  });
});

describe('decideReconnect — transient codes', () => {
  const transient: Array<[string, number | undefined]> = [
    ['connectionClosed 428', DisconnectReason.connectionClosed],
    ['connectionLost/timedOut 408', DisconnectReason.connectionLost],
    ['connectionReplaced 440', DisconnectReason.connectionReplaced],
    ['badSession 500', DisconnectReason.badSession],
    ['unavailableService 503', DisconnectReason.unavailableService],
    ['a plain Error with no status code', undefined],
  ];

  for (const [label, statusCode] of transient) {
    it(`reconnects on ${label}`, () => {
      expect(decide(statusCode)).toMatchObject({ action: 'reconnect' });
    });

    it(`exits on ${label} once the budget is exhausted`, () => {
      expect(decide(statusCode, MAX_CONSECUTIVE_FAILURES)).toMatchObject({
        action: 'exit',
        wipeAuth: false,
      });
    });
  }

  it('never wipes auth for a transient failure', () => {
    const decision = decide(DisconnectReason.badSession, MAX_CONSECUTIVE_FAILURES);
    expect(decision).toMatchObject({ action: 'exit', wipeAuth: false });
  });

  it('backs off further with each consecutive failure', () => {
    const delays = [0, 1, 2, 3].map((n) => {
      const decision = decide(DisconnectReason.connectionClosed, n);
      return decision.action === 'reconnect' ? decision.delayMs : -1;
    });

    expect(delays[0]).toBeLessThan(delays[1]);
    expect(delays[1]).toBeLessThan(delays[2]);
    expect(delays[2]).toBeLessThan(delays[3]);
  });

  it('reconnects on the last attempt before the budget runs out', () => {
    expect(decide(DisconnectReason.connectionClosed, MAX_CONSECUTIVE_FAILURES - 1)).toMatchObject({
      action: 'reconnect',
    });
  });
});

describe('backoffMs', () => {
  it('doubles per attempt at the midpoint of the jitter range', () => {
    const noJitter = () => 0.5;
    expect(backoffMs(0, noJitter)).toBe(1000);
    expect(backoffMs(1, noJitter)).toBe(2000);
    expect(backoffMs(2, noJitter)).toBe(4000);
    expect(backoffMs(3, noJitter)).toBe(8000);
  });

  it('caps at 30s however many attempts have failed', () => {
    expect(backoffMs(20, () => 0.5)).toBe(30_000);
  });

  it('applies +/-20% jitter at the extremes', () => {
    expect(backoffMs(0, () => 0)).toBe(800);
    expect(backoffMs(0, () => 1)).toBe(1200);
  });

  it('stays inside the jitter band for every attempt', () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const base = Math.min(1000 * 2 ** attempt, 30_000);
      const delay = backoffMs(attempt);
      expect(delay).toBeGreaterThanOrEqual(Math.round(base * 0.8));
      expect(delay).toBeLessThanOrEqual(Math.round(base * 1.2));
    }
  });
});

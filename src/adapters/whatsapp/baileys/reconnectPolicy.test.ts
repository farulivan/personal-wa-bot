import { describe, it, expect } from 'vitest';
import { DisconnectReason } from '@whiskeysockets/baileys';
import {
  backoffMs,
  decideReconnect,
  MAX_CONSECUTIVE_FAILURES,
  MAX_CONSECUTIVE_RESTART_REQUIRED,
  SCAN_RETRY_DELAY_MS,
} from './reconnectPolicy.js';

function decide(statusCode: number | undefined, failures = 0, restarts = 0) {
  return decideReconnect({
    statusCode,
    consecutiveFailures: failures,
    consecutiveRestartRequired: restarts,
    awaitingScan: false,
  });
}

/** The same decision for a socket that had a QR code up when it closed. */
function decideAtQrScreen(statusCode: number | undefined, failures = 0) {
  return decideReconnect({
    statusCode,
    consecutiveFailures: failures,
    consecutiveRestartRequired: 0,
    awaitingScan: true,
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
      spends: 'restartRequired',
    });
  });

  it('does not spend the ordinary failure budget', () => {
    expect(decide(DisconnectReason.restartRequired, MAX_CONSECUTIVE_FAILURES + 5)).toMatchObject({
      action: 'reconnect',
      delayMs: 250,
      spends: 'restartRequired',
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
    it(`reconnects on ${label}, and spends the failure budget`, () => {
      expect(decide(statusCode)).toMatchObject({ action: 'reconnect', spends: 'failure' });
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

describe('decideReconnect — waiting for a QR scan', () => {
  it('keeps waiting when the QR codes run out, and spends nothing', () => {
    expect(decideAtQrScreen(DisconnectReason.timedOut)).toEqual({
      action: 'reconnect',
      delayMs: SCAN_RETRY_DELAY_MS,
      reason: 'waiting for scan',
      spends: 'none',
    });
  });

  it('keeps waiting however long nobody scans', () => {
    // The 2026-10-03 outage was 19 hours of this. Each run of ten used to
    // take the process down, 36 times over.
    for (const failures of [MAX_CONSECUTIVE_FAILURES, MAX_CONSECUTIVE_FAILURES + 500]) {
      expect(decideAtQrScreen(DisconnectReason.timedOut, failures)).toMatchObject({
        action: 'reconnect',
        spends: 'none',
      });
    }
  });

  it('still counts a 408 as a failure when no QR code was up', () => {
    // A timeout before any code appears means WhatsApp could not be reached,
    // and a paired socket that times out has lost its connection.
    expect(decide(DisconnectReason.timedOut)).toMatchObject({
      action: 'reconnect',
      spends: 'failure',
    });
    expect(decide(DisconnectReason.timedOut, MAX_CONSECUTIVE_FAILURES)).toMatchObject({
      action: 'exit',
    });
  });

  it('still counts any other error at the QR screen as a failure', () => {
    const others = [
      DisconnectReason.connectionClosed,
      DisconnectReason.unavailableService,
      undefined,
    ];

    for (const statusCode of others) {
      expect(decideAtQrScreen(statusCode)).toMatchObject({
        action: 'reconnect',
        spends: 'failure',
      });
      expect(decideAtQrScreen(statusCode, MAX_CONSECUTIVE_FAILURES)).toMatchObject({
        action: 'exit',
      });
    }
  });

  it('leaves the restart that follows a scan alone', () => {
    expect(decideAtQrScreen(DisconnectReason.restartRequired)).toMatchObject({
      action: 'reconnect',
      spends: 'restartRequired',
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

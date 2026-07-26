import { describe, it, expect, vi } from 'vitest';
import { crashForRestart, handleDisconnect, type RestartDeps } from './processGuards.js';

function makeDeps() {
  const error = vi.fn();
  const log = vi.fn();
  const exit = vi.fn();
  const deps = { error, log, exit } as unknown as RestartDeps;
  return { deps, error, log, exit };
}

describe('crashForRestart', () => {
  it('logs the error with its label and exits non-zero', () => {
    const { deps, error, exit } = makeDeps();
    const boom = new Error('boom');

    crashForRestart('unhandled rejection', boom, deps);

    expect(error).toHaveBeenCalledWith({ err: boom }, 'unhandled rejection — exiting for restart');
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('handleDisconnect', () => {
  it('logs the reason and exits non-zero', () => {
    const { deps, log, exit } = makeDeps();

    handleDisconnect('LOGOUT', deps);

    expect(log).toHaveBeenCalledWith(
      { reason: 'LOGOUT' },
      'client disconnected — exiting for restart'
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});

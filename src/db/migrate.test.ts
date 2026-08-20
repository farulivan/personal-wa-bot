import { describe, it, expect } from 'vitest';
import { retryWithBackoff } from './migrate.js';

type Harness = {
  delays: number[];
  sleep: (ms: number) => Promise<void>;
};

function harness(): Harness {
  const delays: number[] = [];
  return {
    delays,
    sleep: async (ms: number) => {
      delays.push(ms);
    },
  };
}

const base = { attempts: 7, initialDelayMs: 2000, maxDelayMs: 30000 };

/** Fails the first `failures` calls, then succeeds. */
function flaky(failures: number): { task: () => Promise<string>; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    task: async () => {
      calls += 1;
      if (calls <= failures) throw new Error(`attempt ${calls}: connection refused`);
      return 'migrated';
    },
  };
}

describe('retryWithBackoff', () => {
  it('returns the result without sleeping when the task succeeds', async () => {
    const h = harness();
    const { task, calls } = flaky(0);

    await expect(retryWithBackoff(task, { ...base, sleep: h.sleep })).resolves.toBe('migrated');
    expect(calls()).toBe(1);
    expect(h.delays).toEqual([]);
  });

  it('retries until the task succeeds', async () => {
    const h = harness();
    const { task, calls } = flaky(3);

    await expect(retryWithBackoff(task, { ...base, sleep: h.sleep })).resolves.toBe('migrated');
    expect(calls()).toBe(4);
    expect(h.delays).toEqual([2000, 4000, 8000]);
  });

  it('doubles the delay and caps it', async () => {
    // Six waits totalling ninety seconds — long enough to sit out a Postgres restart, which the
    // old three-tries-over-six-seconds ceiling was not.
    const h = harness();
    const { task } = flaky(Infinity);

    await expect(retryWithBackoff(task, { ...base, sleep: h.sleep })).rejects.toThrow(
      'connection refused'
    );
    expect(h.delays).toEqual([2000, 4000, 8000, 16000, 30000, 30000]);
    expect(h.delays.reduce((a, b) => a + b, 0)).toBe(90000);
  });

  it('rethrows the last error once the attempts are spent', async () => {
    const h = harness();
    const { task, calls } = flaky(Infinity);

    await expect(retryWithBackoff(task, { ...base, attempts: 3, sleep: h.sleep })).rejects.toThrow(
      'attempt 3: connection refused'
    );
    expect(calls()).toBe(3);
  });

  it('does not sleep after the final failure', async () => {
    const h = harness();
    const { task } = flaky(Infinity);

    await expect(
      retryWithBackoff(task, { ...base, attempts: 2, sleep: h.sleep })
    ).rejects.toThrow();
    expect(h.delays).toEqual([2000]);
  });

  it('reports every attempt and error, and only reports a retry when one follows', async () => {
    const h = harness();
    const { task } = flaky(1);
    const attempts: number[] = [];
    const errors: number[] = [];
    const retries: Array<[number, number]> = [];

    await retryWithBackoff(task, {
      ...base,
      sleep: h.sleep,
      onAttempt: (attempt) => attempts.push(attempt),
      onError: (_err, attempt) => errors.push(attempt),
      onRetry: (attempt, delayMs) => retries.push([attempt, delayMs]),
    });

    expect(attempts).toEqual([1, 2]);
    expect(errors).toEqual([1]);
    expect(retries).toEqual([[1, 2000]]);
  });
});

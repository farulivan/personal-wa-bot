import { describe, it, expect } from 'vitest';
import { ok, err } from './result.js';

describe('Result', () => {
  it('ok() creates a successful result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it('err() creates a failed result', () => {
    const result = err('something went wrong');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('something went wrong');
  });

  it('ok() works with objects', () => {
    const result = ok({ name: 'test', count: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('test');
      expect(result.value.count).toBe(5);
    }
  });

  it('err() works with typed errors', () => {
    const result = err({ code: 404, message: 'not found' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(404);
    }
  });
});

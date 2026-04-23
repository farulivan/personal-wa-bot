import { describe, it, expect } from 'vitest';
import { isGreeting } from './greetingHandler.js';

describe('isGreeting', () => {
  it('matches bare "hi"', () => {
    expect(isGreeting('hi')).toBe(true);
  });

  it('matches "hi" with surrounding text', () => {
    expect(isGreeting('hi there')).toBe(true);
  });

  it('does not match "history"', () => {
    expect(isGreeting('history')).toBe(false);
  });

  it('does not match "high"', () => {
    expect(isGreeting('high five')).toBe(false);
  });

  it('matches "hello"', () => {
    expect(isGreeting('hello')).toBe(true);
  });

  it('matches "halo"', () => {
    expect(isGreeting('halo bot')).toBe(true);
  });
});

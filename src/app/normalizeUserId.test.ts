import { describe, it, expect } from 'vitest';
import { normalizeUserId } from './normalizeUserId.js';

describe('normalizeUserId', () => {
  it('strips @c.us suffix', () => {
    expect(normalizeUserId('628123456789@c.us')).toBe('628123456789');
  });

  it('strips @lid suffix', () => {
    expect(normalizeUserId('628123456789@lid')).toBe('628123456789');
  });

  it('strips @g.us suffix', () => {
    expect(normalizeUserId('120363000000000001@g.us')).toBe('120363000000000001');
  });

  it('returns unchanged if no suffix', () => {
    expect(normalizeUserId('628123456789')).toBe('628123456789');
  });

  it('does not strip mid-string @', () => {
    expect(normalizeUserId('628@c.us.fake')).toBe('628@c.us.fake');
  });
});

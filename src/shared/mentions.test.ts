import { describe, it, expect } from 'vitest';
import { formatMentionTag } from './mentions.js';

describe('formatMentionTag', () => {
  it('returns @<phoneNumber> from a phone number string', () => {
    expect(formatMentionTag('628111111111')).toBe('@628111111111');
  });

  it('works with any phone number string', () => {
    expect(formatMentionTag('6281234567890')).toBe('@6281234567890');
  });
});

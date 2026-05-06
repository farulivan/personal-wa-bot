import { describe, it, expect } from 'vitest';
import { formatMentionTag, phoneToMentionJid } from './mentions.js';

describe('formatMentionTag', () => {
  it('returns @<phoneNumber> from a phone number string', () => {
    expect(formatMentionTag('628111111111')).toBe('@628111111111');
  });

  it('works with any phone number string', () => {
    expect(formatMentionTag('6281234567890')).toBe('@6281234567890');
  });
});

describe('phoneToMentionJid', () => {
  it('appends @c.us to the phone number', () => {
    expect(phoneToMentionJid('628111111111')).toBe('628111111111@c.us');
  });

  it('works with any phone number string', () => {
    expect(phoneToMentionJid('6281234567890')).toBe('6281234567890@c.us');
  });
});

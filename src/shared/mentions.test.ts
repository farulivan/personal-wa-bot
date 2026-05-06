import { describe, it, expect } from 'vitest';
import { jidToPhone, formatMentionTag } from './mentions.js';

describe('jidToPhone', () => {
  it('strips @c.us suffix', () => {
    expect(jidToPhone('62812345@c.us')).toBe('62812345');
  });

  it('strips @lid suffix', () => {
    expect(jidToPhone('62812345@lid')).toBe('62812345');
  });

  it('strips @s.whatsapp.net suffix', () => {
    expect(jidToPhone('62812345@s.whatsapp.net')).toBe('62812345');
  });

  it('returns bare string unchanged when no @ present', () => {
    expect(jidToPhone('62812345')).toBe('62812345');
  });
});

describe('formatMentionTag', () => {
  it('returns @<phone> from a JID', () => {
    expect(formatMentionTag('62812345@c.us')).toBe('@62812345');
  });
});

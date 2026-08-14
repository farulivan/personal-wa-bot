import { describe, it, expect } from 'vitest';
import { normalizeUserId } from './normalizeUserId.js';

describe('normalizeUserId', () => {
  it('strips @c.us suffix', () => {
    expect(normalizeUserId('628123456789@c.us')).toBe('628123456789');
  });

  it('strips @s.whatsapp.net suffix', () => {
    expect(normalizeUserId('628123456789@s.whatsapp.net')).toBe('628123456789');
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

  it('strips the device suffix alongside the server part', () => {
    expect(normalizeUserId('628123456789:12@s.whatsapp.net')).toBe('628123456789');
    expect(normalizeUserId('199887766554433:3@lid')).toBe('199887766554433');
    expect(normalizeUserId('628123456789:1@c.us')).toBe('628123456789');
  });

  it('leaves a bare device suffix alone when there is no server part', () => {
    expect(normalizeUserId('628123456789:12')).toBe('628123456789:12');
  });

  it('does not strip mid-string @', () => {
    expect(normalizeUserId('628@c.us.fake')).toBe('628@c.us.fake');
    expect(normalizeUserId('628@s.whatsapp.net.fake')).toBe('628@s.whatsapp.net.fake');
  });
});

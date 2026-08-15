import { describe, it, expect } from 'vitest';
import { stripJidServer, toPhoneNumber, toWaUserId } from './identity.js';

describe('stripJidServer', () => {
  it('strips @c.us suffix', () => {
    expect(stripJidServer('628123456789@c.us')).toBe('628123456789');
  });

  it('strips @s.whatsapp.net suffix', () => {
    expect(stripJidServer('628123456789@s.whatsapp.net')).toBe('628123456789');
  });

  it('strips @lid suffix', () => {
    expect(stripJidServer('628123456789@lid')).toBe('628123456789');
  });

  it('strips @g.us suffix', () => {
    expect(stripJidServer('120363000000000001@g.us')).toBe('120363000000000001');
  });

  it('returns unchanged if no suffix', () => {
    expect(stripJidServer('628123456789')).toBe('628123456789');
  });

  it('strips the device suffix alongside the server part', () => {
    expect(stripJidServer('628123456789:12@s.whatsapp.net')).toBe('628123456789');
    expect(stripJidServer('199887766554433:3@lid')).toBe('199887766554433');
    expect(stripJidServer('628123456789:1@c.us')).toBe('628123456789');
  });

  it('leaves a bare device suffix alone when there is no server part', () => {
    expect(stripJidServer('628123456789:12')).toBe('628123456789:12');
  });

  it('does not strip mid-string @', () => {
    expect(stripJidServer('628@c.us.fake')).toBe('628@c.us.fake');
    expect(stripJidServer('628@s.whatsapp.net.fake')).toBe('628@s.whatsapp.net.fake');
  });
});

describe('constructors', () => {
  it('toWaUserId strips the server part of the addressed jid', () => {
    expect(toWaUserId('199887766554433@lid')).toBe('199887766554433');
    expect(toWaUserId('628123456789:12@s.whatsapp.net')).toBe('628123456789');
  });

  it('toPhoneNumber strips the server part of a phone jid', () => {
    expect(toPhoneNumber('628123456789@s.whatsapp.net')).toBe('628123456789');
    expect(toPhoneNumber('628123456789')).toBe('628123456789');
  });
});

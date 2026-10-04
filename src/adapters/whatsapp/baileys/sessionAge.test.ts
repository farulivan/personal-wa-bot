import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { initAuthCreds, proto, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { sessionAgeFields, sessionLinkedAt } from './sessionAge.js';

/** 2026-10-04T03:04:44Z, when the QR code was scanned after the October logout. */
const LINKED_AT_SECONDS = 1791083084;

/** The device details the phone signs at pairing, encoded the way they travel. */
function deviceDetails(
  identity: proto.IADVDeviceIdentity = { rawId: 1234, timestamp: LINKED_AT_SECONDS, keyIndex: 20 }
): Uint8Array {
  return proto.ADVDeviceIdentity.encode(identity).finish();
}

/**
 * The account Baileys stores after a pairing: the identity the phone signed,
 * decoded into a protobuf object, with the device details still as bytes.
 */
function pairedAccount(details: Uint8Array = deviceDetails()) {
  const signed = proto.ADVSignedDeviceIdentity.encode({
    details,
    accountSignatureKey: new Uint8Array(32).fill(1),
    accountSignature: new Uint8Array(64).fill(2),
    deviceSignature: new Uint8Array(64).fill(3),
  }).finish();

  return proto.ADVSignedDeviceIdentity.decode(signed);
}

describe('sessionLinkedAt', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('reads the link time from credentials that were saved and read back', async () => {
    // This is what every boot sees. Saving turns the identity's bytes into a
    // base64 string, so going through the real auth state is the only way to
    // test the shape production actually hands us.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-session-age-'));
    tempDirs.push(dir);

    const first = await useMultiFileAuthState(dir);
    Object.assign(first.state.creds, { account: pairedAccount() });
    await first.saveCreds();
    const reloaded = await useMultiFileAuthState(dir);

    expect(sessionLinkedAt(reloaded.state.creds)?.toISOString()).toBe('2026-10-04T03:04:44.000Z');
  });

  it('reads it from the base64 string the saved credentials hold', () => {
    const details = Buffer.from(deviceDetails()).toString('base64');

    expect(sessionLinkedAt({ account: { details } })?.toISOString()).toBe(
      '2026-10-04T03:04:44.000Z'
    );
  });

  it('reads it from the bytes Baileys holds right after a pairing', () => {
    const linkedAt = sessionLinkedAt({ account: pairedAccount() });

    expect(linkedAt?.toISOString()).toBe('2026-10-04T03:04:44.000Z');
  });

  it('has nothing to report for a session that is not paired yet', () => {
    expect(sessionLinkedAt(initAuthCreds())).toBeUndefined();
  });

  it('has nothing to report when the identity carries no timestamp', () => {
    const withoutTimestamp = deviceDetails({ rawId: 1234, keyIndex: 20 });

    expect(sessionLinkedAt({ account: pairedAccount(withoutTimestamp) })).toBeUndefined();
    expect(sessionLinkedAt({ account: { details: new Uint8Array(0) } })).toBeUndefined();
    expect(sessionLinkedAt({ account: { details: null } })).toBeUndefined();
  });

  it('returns undefined instead of throwing on details it cannot decode', () => {
    expect(sessionLinkedAt({ account: { details: Buffer.from('not a protobuf at all') } })).toBe(
      undefined
    );
    expect(sessionLinkedAt({ account: { details: 'not base64 either !!!' } })).toBeUndefined();
  });
});

describe('sessionAgeFields', () => {
  it('gives the link time and the age in days', () => {
    const linkedAt = new Date('2026-09-19T07:28:30Z');
    const now = new Date('2026-10-03T19:28:30Z');

    expect(sessionAgeFields(linkedAt, now)).toEqual({
      linkedAt: '2026-09-19T07:28:30.000Z',
      sessionAgeDays: 14.5,
    });
  });

  it('adds nothing when the link time is unknown', () => {
    expect(sessionAgeFields(undefined, new Date('2026-10-03T07:28:30Z'))).toEqual({});
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  applyMentionRewrites,
  createBaileysMessageSender,
  resolveGroupMentions,
  toSendJid,
} from './baileysMessageSender.js';

const GROUP = '120363000000000001@g.us';
const PN = '628111111111@s.whatsapp.net';
const LID = '199887766554433@lid';

function pnGroup() {
  return vi.fn().mockResolvedValue({
    addressingMode: 'pn',
    participants: [{ id: PN, lid: LID }, { id: '628222222222@s.whatsapp.net' }],
  });
}

function lidGroup() {
  return vi.fn().mockResolvedValue({
    addressingMode: 'lid',
    participants: [{ id: LID, phoneNumber: PN }],
  });
}

describe('toSendJid', () => {
  it('rewrites a legacy @c.us chat id to @s.whatsapp.net', () => {
    expect(toSendJid('628111111111@c.us')).toBe(PN);
  });

  it('leaves group and already-current ids alone', () => {
    expect(toSendJid(GROUP)).toBe(GROUP);
    expect(toSendJid(PN)).toBe(PN);
  });
});

describe('applyMentionRewrites', () => {
  it('swaps every occurrence of a phone token for its replacement', () => {
    const text = 'Heads up @628111111111 and @628111111111';
    const out = applyMentionRewrites(text, new Map([['628111111111', '199887766554433']]));

    expect(out).toBe('Heads up @199887766554433 and @199887766554433');
  });

  it('leaves the text untouched when there is nothing to rewrite', () => {
    expect(applyMentionRewrites('Heads up @628111111111', new Map())).toBe(
      'Heads up @628111111111'
    );
  });
});

describe('resolveGroupMentions', () => {
  it('uses phone JIDs and leaves the text alone in a pn-addressed group', async () => {
    const result = await resolveGroupMentions(pnGroup(), GROUP, ['628111111111']);

    expect(result.jids).toEqual([PN]);
    expect(result.textRewrites.size).toBe(0);
  });

  it('uses lid JIDs and rewrites the text token in a lid-addressed group', async () => {
    const result = await resolveGroupMentions(lidGroup(), GROUP, ['628111111111']);

    expect(result.jids).toEqual([LID]);
    expect(result.textRewrites.get('628111111111')).toBe('199887766554433');
  });

  it('drops a mention for someone who is not in the group', async () => {
    const result = await resolveGroupMentions(pnGroup(), GROUP, ['628999999999']);

    expect(result.jids).toEqual([]);
  });

  it('falls back to the lid mapping store when the participant row omits the lid', async () => {
    const fetch = vi.fn().mockResolvedValue({
      addressingMode: 'lid',
      participants: [{ id: PN }],
    });
    const resolveLid = vi.fn().mockResolvedValue(LID);

    const result = await resolveGroupMentions(fetch, GROUP, ['628111111111'], resolveLid);

    expect(resolveLid).toHaveBeenCalledWith(PN);
    expect(result.jids).toEqual([LID]);
    expect(result.textRewrites.get('628111111111')).toBe('199887766554433');
  });

  it('drops the mention when even the lid mapping store has nothing', async () => {
    const fetch = vi.fn().mockResolvedValue({
      addressingMode: 'lid',
      participants: [{ id: PN }],
    });

    const result = await resolveGroupMentions(
      fetch,
      GROUP,
      ['628111111111'],
      vi.fn().mockResolvedValue(null)
    );

    expect(result.jids).toEqual([]);
  });

  it('drops the mention rather than throwing when the lid lookup fails', async () => {
    const fetch = vi.fn().mockResolvedValue({
      addressingMode: 'lid',
      participants: [{ id: PN }],
    });

    const result = await resolveGroupMentions(
      fetch,
      GROUP,
      ['628111111111'],
      vi.fn().mockRejectedValue(new Error('mapping store down'))
    );

    expect(result.jids).toEqual([]);
  });

  it('does not consult the lid mapping store in a pn-addressed group', async () => {
    const resolveLid = vi.fn();

    await resolveGroupMentions(pnGroup(), GROUP, ['628111111111'], resolveLid);

    expect(resolveLid).not.toHaveBeenCalled();
  });
});

describe('createBaileysMessageSender', () => {
  it('sends a plain DM without touching group metadata', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const fetch = pnGroup();
    const sender = createBaileysMessageSender(send, fetch);

    await sender.sendMessage('628111111111@c.us', 'hi', ['628111111111']);

    expect(fetch).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(PN, { text: 'hi' });
  });

  it('sends a group message without mentions when none were requested', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const fetch = pnGroup();
    const sender = createBaileysMessageSender(send, fetch);

    await sender.sendMessage(GROUP, 'hi');

    expect(fetch).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(GROUP, { text: 'hi' });
  });

  it('attaches phone JIDs in a pn-addressed group', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const sender = createBaileysMessageSender(send, pnGroup());

    await sender.sendMessage(GROUP, 'Heads up @628111111111', ['628111111111']);

    expect(send).toHaveBeenCalledWith(GROUP, {
      text: 'Heads up @628111111111',
      mentions: [PN],
    });
  });

  it('attaches lid JIDs and rewrites the token in a lid-addressed group', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const sender = createBaileysMessageSender(send, lidGroup());

    await sender.sendMessage(GROUP, 'Heads up @628111111111', ['628111111111']);

    expect(send).toHaveBeenCalledWith(GROUP, {
      text: 'Heads up @199887766554433',
      mentions: [LID],
    });
  });

  it('still sends the message when no mention could be resolved', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const sender = createBaileysMessageSender(send, pnGroup());

    await sender.sendMessage(GROUP, 'Heads up @628999999999', ['628999999999']);

    expect(send).toHaveBeenCalledWith(GROUP, { text: 'Heads up @628999999999' });
  });

  it('loses the mentions, not the message, when metadata lookup fails', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const fetch = vi.fn().mockRejectedValue(new Error('metadata unavailable'));
    const sender = createBaileysMessageSender(send, fetch);

    await sender.sendMessage(GROUP, 'Heads up @628111111111', ['628111111111']);

    expect(send).toHaveBeenCalledWith(GROUP, { text: 'Heads up @628111111111' });
  });
});

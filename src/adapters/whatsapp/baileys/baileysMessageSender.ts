import { normalizeUserId } from '../../../app/normalizeUserId.js';
import type { MessageSenderPort } from '../ports.js';
import { isLidAddressed, participantJids } from './groupMetadata.js';
import type { FetchGroupMetadata } from './groupMetadata.js';
import { debug, error } from '../../../logger.js';

/**
 * Looks up a member's LID from their phone JID via Baileys' own PN↔LID mapping
 * store. Group metadata is the first source, but it does not always carry the
 * complement — this is the fallback that keeps the mention rather than dropping it.
 */
export type ResolveLidForPhone = (pnJid: string) => Promise<string | null>;

export type BaileysSendLike = (
  jid: string,
  content: { text: string; mentions?: string[] }
) => Promise<unknown>;

const GROUP_SUFFIX = '@g.us';

/**
 * Stored chat ids predate this transport, so DM targets can still be `@c.us`.
 * Baileys coerces those internally, but relying on that is relying on an
 * implementation detail.
 */
export function toSendJid(chatId: string): string {
  return chatId.endsWith('@c.us') ? `${chatId.slice(0, -'@c.us'.length)}@s.whatsapp.net` : chatId;
}

export type ResolvedMentions = {
  /** JIDs for contextInfo.mentionedJid, in the form this group addresses by. */
  jids: string[];
  /** Rewrites of the visible `@<number>` text tokens, keyed by phone number. */
  textRewrites: Map<string, string>;
};

/**
 * Turns bare phone numbers into the mention JIDs a specific group expects.
 *
 * A group addresses its members either by phone number or by LID, and a
 * mention only renders if the JID matches that form. In a lid-addressed group
 * the visible `@<phone>` token has to become `@<lid>` too, so the text and the
 * mention agree. Members we cannot find are dropped rather than guessed at —
 * a wrong JID silently fails to notify anyone.
 */
export async function resolveGroupMentions(
  fetchGroupMetadata: FetchGroupMetadata,
  groupId: string,
  mentionNumbers: string[],
  resolveLidForPhone?: ResolveLidForPhone
): Promise<ResolvedMentions> {
  const metadata = await fetchGroupMetadata(groupId);
  const useLid = isLidAddressed(metadata);

  const byPhoneNumber = new Map<string, { pnJid?: string; lidJid?: string }>();
  for (const participant of metadata.participants) {
    const jids = participantJids(participant);
    if (jids.pnJid) {
      byPhoneNumber.set(normalizeUserId(jids.pnJid), jids);
    }
  }

  const jids: string[] = [];
  const textRewrites = new Map<string, string>();

  for (const phoneNumber of mentionNumbers) {
    const member = byPhoneNumber.get(normalizeUserId(phoneNumber));
    let jid = useLid ? member?.lidJid : member?.pnJid;

    // A lid-addressed group does not always carry the lid on the participant
    // row. Baileys keeps its own PN↔LID mapping, so ask that before giving up.
    if (!jid && useLid && member?.pnJid && resolveLidForPhone) {
      try {
        jid = (await resolveLidForPhone(member.pnJid)) ?? undefined;
      } catch (err) {
        debug({ err, groupId }, 'lid mapping lookup failed');
      }
    }

    if (!jid) {
      debug({ groupId, useLid }, 'dropping mention for an unresolvable group member');
      continue;
    }

    jids.push(jid);
    if (useLid) {
      textRewrites.set(phoneNumber, normalizeUserId(jid));
    }
  }

  return { jids, textRewrites };
}

/** Applies the `@<phone>` → `@<lid>` rewrites to the message body. */
export function applyMentionRewrites(text: string, rewrites: Map<string, string>): string {
  let rewritten = text;
  for (const [phoneNumber, replacement] of rewrites) {
    rewritten = rewritten.split(`@${phoneNumber}`).join(`@${replacement}`);
  }
  return rewritten;
}

export function createBaileysMessageSender(
  send: BaileysSendLike,
  fetchGroupMetadata: FetchGroupMetadata,
  resolveLidForPhone?: ResolveLidForPhone
): MessageSenderPort {
  return {
    async sendMessage(chatId: string, text: string, mentionNumbers?: string[]): Promise<unknown> {
      const jid = toSendJid(chatId);

      // Mentions only mean anything in a group.
      if (!chatId.endsWith(GROUP_SUFFIX) || !mentionNumbers || mentionNumbers.length === 0) {
        return send(jid, { text });
      }

      try {
        const { jids, textRewrites } = await resolveGroupMentions(
          fetchGroupMetadata,
          chatId,
          mentionNumbers,
          resolveLidForPhone
        );

        if (jids.length === 0) {
          return send(jid, { text });
        }

        return send(jid, { text: applyMentionRewrites(text, textRewrites), mentions: jids });
      } catch (err) {
        // A metadata failure should cost the mentions, not the message.
        error({ err, chatId }, 'failed to resolve group mentions, sending without them');
        return send(jid, { text });
      }
    },
  };
}

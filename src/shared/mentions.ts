/**
 * The visible `@<number>` token inside message text. The matching JID that
 * makes WhatsApp render it as a real mention is built by the transport
 * adapter, which is the only layer that knows what a JID looks like.
 */
export function formatMentionTag(phoneNumber: string): string {
  return `@${phoneNumber}`;
}

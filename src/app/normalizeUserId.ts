/**
 * Normalize a WhatsApp user ID to the bare identifier we store as our db user id.
 * Strips the optional device suffix and the server part of every JID form we
 * see: @c.us (whatsapp-web.js), @s.whatsapp.net and @lid (Baileys), @g.us.
 *
 * Examples:
 * - "628123456789@c.us" -> "628123456789"
 * - "628123456789@s.whatsapp.net" -> "628123456789"
 * - "628123456789:12@s.whatsapp.net" -> "628123456789"
 * - "199887766554433@lid" -> "199887766554433"
 * - "628123456789" -> "628123456789"
 */
export function normalizeUserId(userId: string): string {
  return userId.replace(/(?::\d+)?@(c\.us|s\.whatsapp\.net|lid|g\.us)$/, '');
}

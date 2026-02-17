/**
 * Normalize WhatsApp user ID to consistent format.
 * Strips @c.us, @lid, @g.us suffixes and returns just the number part.
 * 
 * Examples:
 * - "628123456789@c.us" -> "628123456789"
 * - "628123456789@lid" -> "628123456789"
 * - "628123456789" -> "628123456789"
 */
export function normalizeUserId(userId: string): string {
  return userId.replace(/@(c\.us|lid|g\.us)$/, '');
}

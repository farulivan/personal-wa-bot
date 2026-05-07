export function formatMentionTag(phoneNumber: string): string {
  return `@${phoneNumber}`;
}

export function phoneToMentionJid(phoneNumber: string): string {
  return `${phoneNumber}@c.us`;
}

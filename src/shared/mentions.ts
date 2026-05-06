export function jidToPhone(jid: string): string {
  const at = jid.indexOf('@');
  return at === -1 ? jid : jid.slice(0, at);
}

export function formatMentionTag(jid: string): string {
  return `@${jidToPhone(jid)}`;
}

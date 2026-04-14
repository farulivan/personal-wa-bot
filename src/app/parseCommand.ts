export type CommandInvocation = {
  namespace: string;
  subcommand: string;
  firstLine: string;
  payloadText: string;
  rawText: string;
  deprecatedFlag: string | null;
};

export function parseCommand(text: string): CommandInvocation | null {
  const rawText = text;
  const trimmed = text.trim();
  if (!trimmed.startsWith('#')) return null;

  const [firstLine, ...rest] = trimmed.split('\n');
  const tokens = firstLine.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const nsToken = tokens[0];
  if (!nsToken.startsWith('#') || nsToken.length === 1) return null;

  const namespace = nsToken.slice(1).toLowerCase();

  const secondToken = tokens[1] || '';
  const subcommand =
    secondToken && !secondToken.startsWith('--') ? secondToken.toLowerCase() : '';

  const DEPRECATED_ACTION_FLAGS = ['list', 'leaderboard', 'mark'];
  const deprecatedToken = tokens.find(
    (t) => t.startsWith('--') && DEPRECATED_ACTION_FLAGS.includes(t.slice(2).toLowerCase())
  );
  const deprecatedFlag = deprecatedToken ? deprecatedToken.slice(2).toLowerCase() : null;

  const payloadText = rest.join('\n').trim();

  return {
    namespace,
    subcommand,
    firstLine,
    payloadText,
    rawText,
    deprecatedFlag,
  };
}

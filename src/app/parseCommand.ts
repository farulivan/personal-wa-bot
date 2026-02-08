export type CommandInvocation = {
  namespace: string;
  subcommand: string;
  firstLine: string;
  payloadText: string;
  rawText: string;
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

  const subToken = tokens.find((t) => t.startsWith('--'));
  const subcommand = (subToken ? subToken.slice(2) : '').trim().toLowerCase() || 'log';

  const payloadText = rest.join('\n').trim();

  return {
    namespace,
    subcommand,
    firstLine,
    payloadText,
    rawText,
  };
}

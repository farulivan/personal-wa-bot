import type { PhoneNumber, WaUserId } from '../shared/identity.js';
import type { CommandInvocation } from './parseCommand.js';
import type { TimeContext } from './timeContext.js';

export type CommandContext = {
  sender: WaUserId;
  replyChatId: string;
  isGroupChat: boolean;
  time: TimeContext;
};

/** `mentions` holds bare phone numbers; the transport adapter builds the JIDs. */
export type RichReply = { text: string; mentions: PhoneNumber[] };

export type NamespaceHandler = (
  ctx: CommandContext,
  invocation: CommandInvocation
) => Promise<string | RichReply | null>;

export class CommandRouter {
  private namespaceHandlers: Map<string, NamespaceHandler> = new Map();

  registerNamespace(namespace: string, handler: NamespaceHandler): void {
    this.namespaceHandlers.set(namespace.toLowerCase(), handler);
  }

  async route(
    ctx: CommandContext,
    invocation: CommandInvocation
  ): Promise<string | RichReply | null> {
    const handler = this.namespaceHandlers.get(invocation.namespace.toLowerCase());
    if (!handler) return null;

    if (invocation.deprecatedFlag) {
      const flag = invocation.deprecatedFlag;
      const corrected = invocation.firstLine
        .replace(new RegExp(`\\s*--${flag}\\b`, 'i'), ` ${flag}`)
        .trim();
      return (
        `Syntax has changed — actions no longer use --.\n\n` +
        `Try:\n${corrected}\n\n` +
        `For details, send: #${invocation.namespace} help`
      );
    }

    return handler(ctx, invocation);
  }
}

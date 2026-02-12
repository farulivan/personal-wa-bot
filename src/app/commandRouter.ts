import type { Database } from 'better-sqlite3';
import type { CommandInvocation } from './parseCommand.js';

export type CommandContext = {
  db: Database;
  sender: string;
  timezoneOffsetMinutes: number;
  now: () => Date;
};

export type NamespaceHandler = (
  ctx: CommandContext,
  invocation: CommandInvocation
) => Promise<string | null>;

export class CommandRouter {
  private namespaceHandlers: Map<string, NamespaceHandler> = new Map();

  registerNamespace(namespace: string, handler: NamespaceHandler): void {
    this.namespaceHandlers.set(namespace.toLowerCase(), handler);
  }

  async route(ctx: CommandContext, invocation: CommandInvocation): Promise<string | null> {
    const handler = this.namespaceHandlers.get(invocation.namespace.toLowerCase());
    if (!handler) return null;
    return handler(ctx, invocation);
  }
}

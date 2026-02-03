import type { MessageContext, CommandResult } from '../types/types.js';

// Base interface for all features
export interface Feature {
  // Feature name for logging and identification
  name: string;

  // Commands this feature handles (e.g., ['workout', 'list'])
  commands: string[];

  // Check if this feature can handle the given command
  canHandle(command: string): boolean;

  // Handle the command and return result
  handle(ctx: MessageContext): Promise<CommandResult>;

  // Get help text for this feature
  getHelp(): string;
}

// Base class with common functionality
export abstract class BaseFeature implements Feature {
  abstract name: string;
  abstract commands: string[];

  canHandle(command: string): boolean {
    return this.commands.some((cmd) => command === cmd || command.startsWith(`${cmd} `));
  }

  abstract handle(ctx: MessageContext): Promise<CommandResult>;

  abstract getHelp(): string;
}

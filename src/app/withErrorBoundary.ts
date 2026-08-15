import { error } from '../logger.js';
import type { NamespaceHandler } from './commandRouter.js';

export function withErrorBoundary(moduleName: string, handler: NamespaceHandler): NamespaceHandler {
  return async (ctx, invocation) => {
    try {
      return await handler(ctx, invocation);
    } catch (err) {
      error({ err, moduleName }, 'Unhandled error in command handler');
      return `Something went wrong. Please try again in a moment.`;
    }
  };
}

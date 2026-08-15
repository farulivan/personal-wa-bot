import { debug } from '../logger.js';
import type { WaUserId } from '../shared/identity.js';

/**
 * The allowlist holds **WhatsApp user ids**, not phone numbers — in our chats
 * those are LIDs. See `src/shared/identity.ts` for why the distinction matters.
 */
export function createAuthGuard(allowedWaIds: ReadonlySet<string>) {
  return function isAllowedUser(userId: WaUserId): boolean {
    if (allowedWaIds.size === 0) {
      debug('no allowlist configured, rejecting all');
      return false;
    }

    const isAllowed = allowedWaIds.has(userId);
    debug({ userId, isAllowed }, 'auth check result');
    return isAllowed;
  };
}

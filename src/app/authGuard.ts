import { debug } from '../logger.js';
import { normalizeUserId } from './normalizeUserId.js';

export function createAuthGuard(allowedNumbers: ReadonlySet<string>) {
  return function isAllowedUser(phoneNumber: string): boolean {
    const number = normalizeUserId(phoneNumber);

    debug({ raw: phoneNumber, normalized: number }, 'checking sender');

    if (allowedNumbers.size === 0) {
      debug('no ALLOWED_NUMBERS configured, rejecting all');
      return false;
    }

    const isAllowed = allowedNumbers.has(number);
    debug({ isAllowed, number }, 'auth check result');
    return isAllowed;
  };
}

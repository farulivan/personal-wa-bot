import { debug } from '../logger.js';
import { normalizeUserId } from './normalizeUserId.js';

export function createAuthGuard(allowedNumbers: ReadonlySet<string>) {
  return function isAllowedUser(phoneNumber: string): boolean {
    const number = normalizeUserId(phoneNumber);

    debug(`📞 Checking sender: ${phoneNumber} → extracted: ${number}`);

    if (allowedNumbers.size === 0) {
      debug('⚠️ No ALLOWED_NUMBERS configured. Rejecting all messages.');
      return false;
    }

    const isAllowed = allowedNumbers.has(number);
    debug(`✅ Is allowed: ${isAllowed}`);
    return isAllowed;
  };
}

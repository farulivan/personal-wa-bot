import { debug } from './logger.js';
import { appConfig } from './config/env.js';

// Allowed phone numbers that can interact with the bot
// Format: comma-separated, e.g., "6281234567890,6289876543210"
// Set via ALLOWED_NUMBERS environment variable
export const ALLOWED_NUMBERS: Set<string> = appConfig.allowedNumbers;

// If no numbers configured, bot will reject all messages (safe default)
export const isAllowedUser = (phoneNumber: string): boolean => {
  // Extract number from WhatsApp ID format (e.g., "6281234567890@c.us" → "6281234567890")
  const number = phoneNumber.replace(/@.*$/, '');

  debug(`📞 Checking sender: ${phoneNumber} → extracted: ${number}`);

  if (ALLOWED_NUMBERS.size === 0) {
    debug('⚠️ No ALLOWED_NUMBERS configured. Rejecting all messages.');
    return false;
  }

  const isAllowed = ALLOWED_NUMBERS.has(number);
  debug(`✅ Is allowed: ${isAllowed}`);
  return isAllowed;
};

// Allowed phone numbers that can interact with the bot
// Format: comma-separated, e.g., "6281234567890,6289876543210"
// Set via ALLOWED_NUMBERS environment variable
const allowedNumbersEnv = process.env.ALLOWED_NUMBERS || '';

export const ALLOWED_NUMBERS: Set<string> = new Set(
  allowedNumbersEnv
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
);

// If no numbers configured, bot will reject all messages (safe default)
export const isAllowedUser = (phoneNumber: string): boolean => {
  // Extract number from WhatsApp ID format (e.g., "6281234567890@c.us" → "6281234567890")
  const number = phoneNumber.replace(/@.*$/, '');
  
  console.log(`📞 Checking sender: ${phoneNumber} → extracted: ${number}`);
  console.log(`📋 Allowed numbers: [${Array.from(ALLOWED_NUMBERS).join(', ')}]`);
  
  if (ALLOWED_NUMBERS.size === 0) {
    console.warn('⚠️ No ALLOWED_NUMBERS configured. Rejecting all messages.');
    return false;
  }
  
  const isAllowed = ALLOWED_NUMBERS.has(number);
  console.log(`✅ Is allowed: ${isAllowed}`);
  return isAllowed;
};

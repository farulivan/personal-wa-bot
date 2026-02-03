// Application configuration
// All app-wide settings should be defined here

export const appConfig = {
  // User timezone offset in minutes (UTC+7 = 420 minutes)
  timezone: {
    offsetMinutes: Number(process.env.USER_TIMEZONE_OFFSET) || 420,
    name: process.env.USER_TIMEZONE_NAME || 'Asia/Jakarta',
  },

  // Bot command prefix
  commandPrefix: '#',

  // Allowed phone numbers that can interact with the bot
  // Format: comma-separated, e.g., "6281234567890,6289876543210"
  allowedNumbers: new Set(
    (process.env.ALLOWED_NUMBERS || '')
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
  ),

  // Data storage path
  dataPath: process.env.RAILWAY_VOLUME_MOUNT_PATH || 'data',

  // WhatsApp auth path
  authPath: process.env.RAILWAY_VOLUME_MOUNT_PATH || '.wwebjs_auth',

  // Puppeteer executable path
  puppeteerPath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
} as const;

// Helper function to check if a user is allowed
export function isAllowedUser(phoneNumber: string): boolean {
  // Extract number from WhatsApp ID format (e.g., "6281234567890@c.us" → "6281234567890")
  const number = phoneNumber.replace(/@.*$/, '');

  console.log(`📞 Checking sender: ${phoneNumber} → extracted: ${number}`);

  if (appConfig.allowedNumbers.size === 0) {
    console.warn('⚠️ No ALLOWED_NUMBERS configured. Rejecting all messages.');
    return false;
  }

  const isAllowed = appConfig.allowedNumbers.has(number);
  console.log(`✅ Is allowed: ${isAllowed}`);
  return isAllowed;
}

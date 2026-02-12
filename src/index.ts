import { client } from './bot.js';
import { db } from './db.js';
import { debug, log, error } from './logger.js';

// --- Wire up modules ---
import { CommandRouter } from './app/commandRouter.js';
import { createMessageHandler } from './app/messageHandler.js';
import { startScheduler } from './app/scheduler.js';
import { registerWorkoutSchema } from './modules/workouts/workoutSchema.js';
import { createWorkoutNamespaceHandler } from './modules/workouts/workoutNamespace.js';
import { sendDailyStreakDigest } from './modules/workouts/workoutDigest.js';
import { USER_TIMEZONE_OFFSET, DAILY_DIGEST_HOUR, DIGEST_GROUP_ID } from './app/constants.js';

registerWorkoutSchema(db);

const router = new CommandRouter();
router.registerNamespace('workout', createWorkoutNamespaceHandler());

const handleMessage = createMessageHandler(router);

// --- Start bot ---
log('🚀 Starting bot initialization...');

client.on('message', async (msg) => {
  await handleMessage(msg);
});

client.on('ready', () => {
  if (DIGEST_GROUP_ID) {
    startScheduler([
      {
        name: 'Daily Streak Standings',
        hour: DAILY_DIGEST_HOUR,
        timezoneOffsetMinutes: USER_TIMEZONE_OFFSET,
        run: () => sendDailyStreakDigest(DIGEST_GROUP_ID),
      },
    ]);
  } else {
    log('⚠️ DIGEST_GROUP_ID not set — daily digest disabled');
  }
});

client
  .initialize()
  .then(() => {
    debug('✅ client.initialize() completed');
  })
  .catch((err) => {
    error('❌ client.initialize() failed:', err);
  });

import { client } from './bot.js';
import { db } from './db.js';
import { debug, log, error } from './logger.js';
import { appConfig } from './config/env.js';

// --- Wire up modules ---
import { CommandRouter } from './app/commandRouter.js';
import { createMessageHandler } from './app/messageHandler.js';
import { startScheduler } from './app/scheduler.js';
import { createMessageGateway } from './adapters/whatsapp/messageGateway.js';
import { registerWorkoutSchema } from './modules/workouts/workoutSchema.js';
import { createWorkoutNamespaceHandler } from './modules/workouts/workoutNamespace.js';
import { createDailyStreakDigestSender } from './modules/workouts/workoutDigest.js';
import { SqliteWorkoutRepository } from './modules/workouts/infra/sqliteWorkoutRepository.js';
import {
  USER_TIMEZONE_OFFSET,
  DAILY_DIGEST_HOUR,
  DAILY_DIGEST_MINUTE,
  DIGEST_GROUP_ID,
} from './app/constants.js';

registerWorkoutSchema(db);

const messageGateway = createMessageGateway(client);
const workoutRepository = new SqliteWorkoutRepository(db);

const router = new CommandRouter();
router.registerNamespace('workout', createWorkoutNamespaceHandler(workoutRepository));

const appContext = {
  db,
  client,
  config: appConfig,
  messageGateway,
  workoutRepository,
};

const sendDailyStreakDigest = createDailyStreakDigestSender({
  client,
  db,
  workoutRepository,
  timezoneOffsetMinutes: USER_TIMEZONE_OFFSET,
});

const handleMessage = createMessageHandler(router, appContext);

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
        minute: DAILY_DIGEST_MINUTE,
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

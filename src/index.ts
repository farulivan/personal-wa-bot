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
import { registerSholatSchema } from './modules/sholat/sholatSchema.js';
import { createSholatNamespaceHandler } from './modules/sholat/sholatNamespace.js';
import { SqliteSholatRepository } from './modules/sholat/infra/sqliteSholatRepository.js';
import { MyQuranSholatClient } from './modules/sholat/infra/myQuranSholatClient.js';
import { registerQuranSchema } from './modules/quran/quranSchema.js';
import { createQuranNamespaceHandler } from './modules/quran/quranNamespace.js';
import { SqliteQuranRepository } from './modules/quran/infra/sqliteQuranRepository.js';
import { createQuranReminderSender } from './modules/quran/quranDigest.js';
import { registerRemindSchema } from './modules/remind/remindSchema.js';
import { createRemindNamespaceHandler } from './modules/remind/remindNamespace.js';
import { SqliteRemindRepository } from './modules/remind/infra/sqliteRemindRepository.js';
import { startReminderScheduler } from './modules/remind/remindScheduler.js';
import { registerUserSchema } from './modules/users/userSchema.js';
import { SqliteUserRepository } from './modules/users/infra/sqliteUserRepository.js';
import {
  USER_TIMEZONE_OFFSET,
  DAILY_DIGEST_HOUR,
  DAILY_DIGEST_MINUTE,
  QURAN_REMINDER_HOUR,
  QURAN_REMINDER_MINUTE,
  DIGEST_GROUP_ID,
} from './app/constants.js';

registerWorkoutSchema(db);
registerSholatSchema(db);
registerQuranSchema(db);
registerRemindSchema(db);
registerUserSchema(db);

const messageGateway = createMessageGateway(client);
const workoutRepository = new SqliteWorkoutRepository(db);
const sholatRepository = new SqliteSholatRepository(db);
const sholatClient = new MyQuranSholatClient();
const quranRepository = new SqliteQuranRepository(db);
const remindRepository = new SqliteRemindRepository(db);
const userRepository = new SqliteUserRepository(db);

const router = new CommandRouter();
router.registerNamespace('workout', createWorkoutNamespaceHandler(workoutRepository));
router.registerNamespace(
  'sholat',
  createSholatNamespaceHandler({
    sholatRepository,
    sholatClient,
    defaultLocation: appConfig.sholatDefaultLocation,
    defaultTimezone: appConfig.sholatTimezone,
  })
);
router.registerNamespace('quran', createQuranNamespaceHandler(quranRepository, userRepository));
router.registerNamespace('remind', createRemindNamespaceHandler(remindRepository));

const appContext = {
  db,
  client,
  config: appConfig,
  messageGateway,
  workoutRepository,
  userRepository,
};

const sendDailyStreakDigest = createDailyStreakDigestSender({
  client,
  db,
  workoutRepository,
  userRepository,
  timezoneOffsetMinutes: USER_TIMEZONE_OFFSET,
});

const sendNightlyQuranReminder = createQuranReminderSender({
  client,
  db,
  quranRepository,
  userRepository,
  timezoneOffsetMinutes: USER_TIMEZONE_OFFSET,
});

let reminderSchedulerStarted = false;

const handleMessage = createMessageHandler(router, appContext);

// --- Start bot ---
log('🚀 Starting bot initialization...');

client.on('message', async (msg) => {
  await handleMessage(msg);
});

client.on('ready', () => {
  if (!reminderSchedulerStarted) {
    startReminderScheduler({
      client,
      remindRepository,
      userRepository,
      timezoneOffsetMinutes: USER_TIMEZONE_OFFSET,
    });
    reminderSchedulerStarted = true;
    log('⏰ Reminder scheduler started');
  }

  if (DIGEST_GROUP_ID) {
    startScheduler([
      {
        name: 'Daily Streak Standings',
        hour: DAILY_DIGEST_HOUR,
        minute: DAILY_DIGEST_MINUTE,
        timezoneOffsetMinutes: USER_TIMEZONE_OFFSET,
        run: () => sendDailyStreakDigest(DIGEST_GROUP_ID),
      },
      {
        name: 'Quran Night Reminder',
        hour: QURAN_REMINDER_HOUR,
        minute: QURAN_REMINDER_MINUTE,
        timezoneOffsetMinutes: USER_TIMEZONE_OFFSET,
        run: () => sendNightlyQuranReminder(DIGEST_GROUP_ID),
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

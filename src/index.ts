import { createWhatsAppClient } from './bot.js';
import { debug, log, error } from './logger.js';
import { appConfig } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { createDrizzleDb } from './db/drizzle.js';

// --- Wire up modules ---
import { CommandRouter } from './app/commandRouter.js';
import { createMessageHandler } from './app/messageHandler.js';
import { startScheduler } from './app/scheduler.js';
import { createMessageGateway } from './adapters/whatsapp/messageGateway.js';
import { createWorkoutController } from './modules/workouts/workoutController.js';
import { WorkoutService } from './modules/workouts/workoutService.js';
import { createDailyStreakDigestSender } from './modules/workouts/workoutDigest.js';
import { DrizzleWorkoutRepository } from './modules/workouts/infra/drizzleWorkoutRepository.js';
import { createSholatNamespaceHandler } from './modules/sholat/sholatNamespace.js';
import { DrizzleSholatRepository } from './modules/sholat/infra/drizzleSholatRepository.js';
import { MyQuranSholatClient } from './modules/sholat/infra/myQuranSholatClient.js';
import { createQuranController } from './modules/quran/quranController.js';
import { QuranService } from './modules/quran/quranService.js';
import { DrizzleQuranRepository } from './modules/quran/infra/drizzleQuranRepository.js';
import { createQuranReminderSender } from './modules/quran/quranDigest.js';
import { createRemindNamespaceHandler } from './modules/remind/remindNamespace.js';
import { DrizzleRemindRepository } from './modules/remind/infra/drizzleRemindRepository.js';
import { startReminderScheduler } from './modules/remind/remindScheduler.js';
import { DrizzleUserRepository } from './modules/users/infra/drizzleUserRepository.js';
import {
  USER_TIMEZONE_OFFSET,
  DAILY_DIGEST_HOUR,
  DAILY_DIGEST_MINUTE,
  QURAN_REMINDER_HOUR,
  QURAN_REMINDER_MINUTE,
  DIGEST_GROUP_ID,
} from './config/env.js';

async function main() {
  if (!appConfig.databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // --- Run migrations before anything else ---
  await runMigrations(appConfig.databaseUrl);

  const drizzleDb = createDrizzleDb(appConfig.databaseUrl);
  const client = createWhatsAppClient();

  const messageGateway = createMessageGateway(client);
  const workoutRepository = new DrizzleWorkoutRepository(drizzleDb);
  const sholatRepository = new DrizzleSholatRepository(drizzleDb);
  const sholatClient = new MyQuranSholatClient();
  const quranRepository = new DrizzleQuranRepository(drizzleDb);
  const remindRepository = new DrizzleRemindRepository(drizzleDb);
  const userRepository = new DrizzleUserRepository(drizzleDb);

  const workoutService = new WorkoutService(workoutRepository, userRepository);
  const quranService = new QuranService(quranRepository, userRepository);

  const router = new CommandRouter();
  router.registerNamespace('workout', createWorkoutController(workoutService));
  router.registerNamespace(
    'sholat',
    createSholatNamespaceHandler({
      sholatRepository,
      sholatClient,
      defaultLocation: appConfig.sholatDefaultLocation,
      defaultTimezone: appConfig.sholatTimezone,
    })
  );
  router.registerNamespace('quran', createQuranController(quranService));
  router.registerNamespace('remind', createRemindNamespaceHandler(remindRepository));

  const appContext = {
    client,
    config: appConfig,
    messageGateway,
    workoutRepository,
    quranRepository,
    sholatRepository,
    sholatClient,
    remindRepository,
    userRepository,
  };

  const sendDailyStreakDigest = createDailyStreakDigestSender({
    client,
    workoutService,
    timezoneOffsetMinutes: USER_TIMEZONE_OFFSET,
  });

  const sendNightlyQuranReminder = createQuranReminderSender({
    client,
    quranService,
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
    log('🤖 WhatsApp bot ready');

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
}

main().catch((err) => {
  error('❌ Fatal startup error:', err);
  process.exit(1);
});

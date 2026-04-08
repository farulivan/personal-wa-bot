import { createWhatsAppClient } from './bot.js';
import { debug, log, error } from './logger.js';
import { appConfig } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { createDrizzleDb } from './db/drizzle.js';

// --- App core ---
import { CommandRouter } from './app/commandRouter.js';
import { createMessageHandler } from './app/messageHandler.js';
import { startScheduler } from './app/scheduler.js';
import { createMessageGateway } from './adapters/whatsapp/messageGateway.js';

// --- Infra ---
import { DrizzleWorkoutRepository } from './modules/workouts/infra/drizzleWorkoutRepository.js';
import { DrizzleSholatRepository } from './modules/sholat/infra/drizzleSholatRepository.js';
import { MyQuranSholatClient } from './modules/sholat/infra/myQuranSholatClient.js';
import { DrizzleQuranRepository } from './modules/quran/infra/drizzleQuranRepository.js';
import { DrizzleRemindRepository } from './modules/remind/infra/drizzleRemindRepository.js';
import { DrizzleUserRepository } from './modules/users/infra/drizzleUserRepository.js';

// --- Module registration ---
import { registerWorkoutModule } from './modules/workouts/index.js';
import { registerQuranModule } from './modules/quran/index.js';
import { registerSholatModule } from './modules/sholat/index.js';
import { registerRemindModule } from './modules/remind/index.js';

// --- Users ---
import { UserService } from './modules/users/userService.js';

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

  // --- Repositories ---
  const workoutRepository = new DrizzleWorkoutRepository(drizzleDb);
  const sholatRepository = new DrizzleSholatRepository(drizzleDb);
  const sholatClient = new MyQuranSholatClient();
  const quranRepository = new DrizzleQuranRepository(drizzleDb);
  const remindRepository = new DrizzleRemindRepository(drizzleDb);
  const userRepository = new DrizzleUserRepository(drizzleDb);

  const userService = new UserService(userRepository);

  // --- Register modules ---
  const workout = registerWorkoutModule({
    workoutRepository,
    userRepository,
    client,
    timezoneOffsetMinutes: USER_TIMEZONE_OFFSET,
    digestGroupId: DIGEST_GROUP_ID,
    dailyDigestHour: DAILY_DIGEST_HOUR,
    dailyDigestMinute: DAILY_DIGEST_MINUTE,
  });

  const quran = registerQuranModule({
    quranRepository,
    userRepository,
    client,
    timezoneOffsetMinutes: USER_TIMEZONE_OFFSET,
    digestGroupId: DIGEST_GROUP_ID,
    quranReminderHour: QURAN_REMINDER_HOUR,
    quranReminderMinute: QURAN_REMINDER_MINUTE,
  });

  const sholat = registerSholatModule({
    sholatRepository,
    sholatClient,
    defaultLocation: appConfig.sholatDefaultLocation,
    defaultTimezone: appConfig.sholatTimezone,
  });

  const remind = registerRemindModule({
    remindRepository,
    userRepository,
    client,
    timezoneOffsetMinutes: USER_TIMEZONE_OFFSET,
  });

  // --- Wire router ---
  const router = new CommandRouter();
  router.registerNamespace('workout', workout.controller);
  router.registerNamespace('sholat', sholat.controller);
  router.registerNamespace('quran', quran.controller);
  router.registerNamespace('remind', remind.controller);

  const appContext = {
    client,
    config: appConfig,
    messageGateway,
    userService,
  };

  const handleMessage = createMessageHandler(router, appContext);

  // --- Start bot ---
  log('🚀 Starting bot initialization...');

  client.on('message', async (msg) => {
    await handleMessage(msg);
  });

  let reminderSchedulerStarted = false;
  let digestSchedulerStarted = false;

  client.on('ready', () => {
    log('🤖 WhatsApp bot ready');

    if (!reminderSchedulerStarted) {
      remind.startScheduler();
      reminderSchedulerStarted = true;
      log('⏰ Reminder scheduler started');
    }

    if (!digestSchedulerStarted) {
      const allJobs = [...workout.jobs, ...quran.jobs];
      if (allJobs.length > 0) {
        startScheduler(allJobs);
      } else {
        log('⚠️ DIGEST_GROUP_ID not set — daily digest disabled');
      }
      digestSchedulerStarted = true;
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

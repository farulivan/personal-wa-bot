import http from 'http';
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
import { WhatsAppGroupMembershipAdapter } from './adapters/whatsapp/whatsAppGroupMembershipAdapter.js';

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
import { createAuthGuard } from './app/authGuard.js';

async function main() {
  if (!appConfig.databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // --- Run migrations before anything else ---
  await runMigrations(appConfig.databaseUrl);

  const { db: drizzleDb, close: closeDb } = createDrizzleDb(appConfig.databaseUrl);
  const client = createWhatsAppClient();

  const messageGateway = createMessageGateway(client);
  const senderPort = messageGateway;

  // --- Repositories ---
  const workoutRepository = new DrizzleWorkoutRepository(drizzleDb, appConfig.minWorkoutsForStreak);
  const sholatRepository = new DrizzleSholatRepository(drizzleDb);
  const sholatClient = new MyQuranSholatClient();
  const quranRepository = new DrizzleQuranRepository(drizzleDb);
  const remindRepository = new DrizzleRemindRepository(drizzleDb);
  const userRepository = new DrizzleUserRepository(drizzleDb);

  const userService = new UserService(userRepository);

  const isAllowedUser = createAuthGuard(appConfig.allowedNumbers);

  // --- Register modules ---
  const membershipPort = appConfig.digestGroupId
    ? new WhatsAppGroupMembershipAdapter(client, appConfig.digestGroupId)
    : new WhatsAppGroupMembershipAdapter(client, '');

  const workout = registerWorkoutModule({
    workoutRepository,
    userRepository,
    membershipPort,
    senderPort,
    timezoneOffsetMinutes: appConfig.userTimezoneOffsetMinutes,
    digestGroupId: appConfig.digestGroupId,
    dailyDigestHour: appConfig.dailyDigestHour,
    dailyDigestMinute: appConfig.dailyDigestMinute,
    minWorkoutsForStreak: appConfig.minWorkoutsForStreak,
    workoutListLimit: appConfig.workoutListLimit,
  });

  const quran = registerQuranModule({
    quranRepository,
    userRepository,
    membershipPort,
    senderPort,
    timezoneOffsetMinutes: appConfig.userTimezoneOffsetMinutes,
    digestGroupId: appConfig.digestGroupId,
    quranReminderHour: appConfig.quranReminderHour,
    quranReminderMinute: appConfig.quranReminderMinute,
    quranListLimit: appConfig.quranListLimit,
    ramadhanCountEnabled: appConfig.quranRamadhanCountEnabled,
    ramadhanStartDate: appConfig.quranRamadhanStartDate,
    ramadhanEndDate: appConfig.quranRamadhanEndDate,
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
    client: senderPort,
    timezoneOffsetMinutes: appConfig.userTimezoneOffsetMinutes,
    remindListLimit: appConfig.remindListLimit,
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
    isAllowedUser,
  };

  const handleMessage = createMessageHandler(router, appContext);

  // --- Health check server ---
  const healthPort = Number(process.env.PORT ?? 3000);
  const healthServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  });
  healthServer.listen(healthPort, () => log(`❤️  Health check listening on :${healthPort}`));

  // --- Start bot ---
  log('🚀 Starting bot initialization...');

  client.on('message', async (msg) => {
    await handleMessage(msg);
  });

  let reminderHandle: { stop: () => void } | null = null;
  let digestHandle: { stop: () => void } | null = null;
  let reminderSchedulerStarted = false;
  let digestSchedulerStarted = false;

  async function shutdown(signal: string): Promise<void> {
    log(`🛑 Received ${signal} — shutting down gracefully...`);
    reminderHandle?.stop();
    digestHandle?.stop();
    healthServer.close();
    try {
      await client.destroy();
      log('✅ WhatsApp client destroyed');
    } catch (err) {
      error('⚠️ Error destroying WA client:', err);
    }
    try {
      await closeDb();
      log('✅ Database connection closed');
    } catch (err) {
      error('⚠️ Error closing DB:', err);
    }
    process.exit(0);
  }

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  client.on('ready', () => {
    log('🤖 WhatsApp bot ready');

    if (!reminderSchedulerStarted) {
      reminderHandle = remind.startScheduler();
      reminderSchedulerStarted = true;
      log('⏰ Reminder scheduler started');
    }

    if (!digestSchedulerStarted) {
      const allJobs = [...workout.jobs, ...quran.jobs];
      if (allJobs.length > 0) {
        digestHandle = startScheduler(allJobs);
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

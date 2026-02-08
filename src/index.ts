import { client } from './bot.js';
import { db } from './db.js';
import { debug, log, error } from './logger.js';

// --- Wire up modules ---
import { CommandRouter } from './app/commandRouter.js';
import { createMessageHandler } from './app/messageHandler.js';
import { registerWorkoutSchema } from './modules/workouts/workoutSchema.js';
import { createWorkoutNamespaceHandler } from './modules/workouts/workoutNamespace.js';

registerWorkoutSchema(db);

const router = new CommandRouter();
router.registerNamespace('workout', createWorkoutNamespaceHandler());

const handleMessage = createMessageHandler(router);

// --- Start bot ---
log('🚀 Starting bot initialization...');

client.on('message', async (msg) => {
  await handleMessage(msg);
});

client.initialize().then(() => {
  debug('✅ client.initialize() completed');
}).catch((err) => {
  error('❌ client.initialize() failed:', err);
});

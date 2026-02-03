import { client } from './bot.js';
import { handleMessage } from './handlers.js';
import { debug, log, error } from './logger.js';

log('🚀 Starting bot initialization...');

client.on('message', async (msg) => {
  await handleMessage(msg);
});

client.initialize().then(() => {
  debug('✅ client.initialize() completed');
}).catch((err) => {
  error('❌ client.initialize() failed:', err);
});

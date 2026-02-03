import { client } from './core/bot.js';
import { handleMessage } from './handlers/message.js';
import { initFeatures } from './features/init.js';

// Initialize features before starting the bot
initFeatures();

client.on('message', async (msg) => {
  await handleMessage(msg);
});

client.initialize();

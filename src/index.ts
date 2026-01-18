import { client } from './bot.js';
import { handleMessage } from './handlers.js';

client.on('message', async (msg) => {
  await handleMessage(msg);
});

client.initialize();

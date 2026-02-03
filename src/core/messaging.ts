import type { Message } from '../types/types.js';
import { client } from './bot.js';

// Safe reply function that handles whatsapp-web.js compatibility issues
export async function safeReply(msg: Message, text: string): Promise<void> {
  try {
    // Try sendMessage with sendSeen disabled
    await client.sendMessage(msg.from, text, { sendSeen: false });
  } catch (err) {
    console.log('⚠️ sendMessage with sendSeen:false failed, trying chat.sendMessage');
    try {
      const chat = await msg.getChat();
      await chat.sendMessage(text);
    } catch (err2) {
      console.log('⚠️ chat.sendMessage failed, trying msg.reply');
      try {
        await msg.reply(text);
      } catch (err3) {
        console.error('❌ All send methods failed. Message content:', text);
      }
    }
  }
}

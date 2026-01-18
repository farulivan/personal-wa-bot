import pkg from 'whatsapp-web.js';
type Message = pkg.Message;
import { parseKeyValue } from './parser.js';
import { db } from './db.js';
import { isAllowedUser } from './config.js';
import { client } from './bot.js';

// Safe reply function that handles whatsapp-web.js compatibility issues
async function safeReply(msg: Message, text: string): Promise<void> {
  try {
    await msg.reply(text);
  } catch (err) {
    // Fallback: use client.sendMessage if msg.reply fails
    console.log('⚠️ msg.reply failed, using sendMessage fallback');
    try {
      await client.sendMessage(msg.from, text);
    } catch (err2) {
      console.error('❌ Failed to send message:', err2);
    }
  }
}

export async function handleMessage(msg: Message): Promise<void> {
  try {
    const text = msg.body.trim();

    if (!text.startsWith('#')) return;

    // Security: Only allow whitelisted phone numbers
    const sender = msg.author ?? msg.from;
    if (!isAllowedUser(sender)) {
      console.log(`🚫 Blocked message from unauthorized user: ${sender}`);
      return;
    }

    if (text.startsWith('#workout')) {
      const data = parseKeyValue(text);

      if (!data.date || !data.type || !data.reps || !data.sets) {
        await safeReply(msg,
          '❌ Invalid format\n\n' +
          '#workout\n' +
          'date: YYYY-MM-DD\n' +
          'type: push\n' +
          'reps: 20\n' +
          'sets: 4'
        );
        return;
      }

      const stmt = db.prepare(
        `INSERT INTO workouts (user, date, type, reps, sets, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      stmt.run(
        msg.author ?? msg.from,
        data.date,
        data.type,
        Number(data.reps),
        Number(data.sets),
        new Date().toISOString()
      );

      console.log('💾 Workout saved to database');
      await safeReply(msg, '✅ Workout saved');
    }
  } catch (err) {
    console.error('❌ Error handling message:', err);
  }
}

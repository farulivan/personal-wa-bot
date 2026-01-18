import { Message } from 'whatsapp-web.js';
import { parseKeyValue } from './parser.js';
import { db } from './db.js';
import { isAllowedUser } from './config.js';

export async function handleMessage(msg: Message): Promise<void> {
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
      await msg.reply(
        '❌ Invalid format\n\n' +
        '#workout\n' +
        'date: YYYY-MM-DD\n' +
        'type: push\n' +
        'reps: 20\n' +
        'sets: 4'
      );
      return;
    }

    db.run(
      `INSERT INTO workouts (user, date, type, reps, sets, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        msg.author ?? msg.from,
        data.date,
        data.type,
        Number(data.reps),
        Number(data.sets),
        new Date().toISOString(),
      ]
    );

    await msg.reply('✅ Workout saved');
  }
}

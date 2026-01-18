import pkg from 'whatsapp-web.js';
type Message = pkg.Message;
import { parseKeyValue } from './parser.js';
import { db } from './db.js';
import { isAllowedUser } from './config.js';
import { client } from './bot.js';

// Safe reply function that handles whatsapp-web.js compatibility issues
async function safeReply(msg: Message, text: string): Promise<void> {
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

export async function handleMessage(msg: Message): Promise<void> {
  try {
    let text = msg.body.trim();
    const textLower = text.toLowerCase();
    const isGroup = msg.from.endsWith('@g.us');
    const sender = msg.author ?? msg.from;
    
    // Check if bot is mentioned (for groups)
    let isBotMentioned = false;
    if (isGroup) {
      const mentions = await msg.getMentions();
      const botInfo = await client.info;
      const botNumber = botInfo?.wid?._serialized;
      isBotMentioned = mentions.some((m) => m.id._serialized === botNumber);
    }
    
    // Handle "Halo" greeting when bot is mentioned
    if (isBotMentioned && (textLower.includes('halo') || textLower.includes('hello') || textLower.includes('hi '))) {
      console.log(`👋 Greeting from ${sender}`);
      
      if (isAllowedUser(sender)) {
        await safeReply(msg, 
          `Halo! 👋 Aku bot workout tracker.\n\n` +
          `*Commands:*\n` +
          `• #workout - Simpan workout baru\n` +
          `• #list - Lihat workout terakhir\n\n` +
          `Contoh:\n` +
          `#workout\n` +
          `date: 2026-01-18\n` +
          `type: push\n` +
          `reps: 20\n` +
          `sets: 4`
        );
      } else {
        await safeReply(msg,
          `Halo! 👋 Maaf, kamu belum terdaftar untuk menggunakan bot ini.\n\n` +
          `Hubungi admin untuk mendaftarkan nomormu.`
        );
      }
      return;
    }
    
    // For groups: only respond if bot is mentioned or message starts with #
    if (isGroup) {
      // In groups, require bot mention OR # prefix
      if (!isBotMentioned && !text.startsWith('#')) {
        return;
      }
      
      // Remove bot mention from text if present (e.g., "@Bot #workout..." → "#workout...")
      if (isBotMentioned) {
        text = text.replace(/@\d+\s*/g, '').trim();
        console.log(`👥 Group message with bot mention, cleaned text: ${text}`);
      }
    }

    if (!text.startsWith('#')) return;

    // Security: Only allow whitelisted phone numbers
    if (!isAllowedUser(sender)) {
      console.log(`🚫 Blocked message from unauthorized user: ${sender}`);
      return;
    }
    
    if (isGroup) {
      console.log(`👥 Processing group message from ${sender}`);
    }

    if (text === '#list') {
      // List recent workouts
      const stmt = db.prepare(
        `SELECT date, type, reps, sets FROM workouts 
         WHERE user = ? 
         ORDER BY date DESC, created_at DESC 
         LIMIT 10`
      );
      const rows = stmt.all(msg.author ?? msg.from) as Array<{
        date: string;
        type: string;
        reps: number;
        sets: number;
      }>;

      if (rows.length === 0) {
        await safeReply(msg, '📋 No workouts found');
        return;
      }

      const list = rows
        .map((r) => `• ${r.date} | ${r.type} | ${r.reps}×${r.sets}`)
        .join('\n');
      
      console.log(`📋 Listed ${rows.length} workouts`);
      await safeReply(msg, `📋 *Recent Workouts*\n\n${list}`);
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

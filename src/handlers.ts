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
        // Randomize opening line
        const openings = [
          `Yo! 👊`,
          `What's up 👊 Ready to log a workout?`,
          `Hey. Let's put today's work on the board 💪`
        ];
        
        const randomOpening = openings[Math.floor(Math.random() * openings.length)];
        
        await safeReply(msg, 
          `${randomOpening}\n` +
          `I'm your workout tracker.\n\n`+
          `Log it. Track it. Get stronger.\n\n`+
          `*What I can do:*\n` +
          `• #workout - log a workout\n` +
          `• #list - see your recent workouts\n\n` +
          `*Example:*\n` +
          `#workout\n` +
          `type: bench press\n` +
          `reps: 20\n` +
          `sets: 4\n` +
          `weight: 10 (optional)\n\n` +
          `(weight is in kg, leave it blank for bodyweight)`
        );
      } else {
        await safeReply(msg,
          `Hey 👋\n` +
          `Looks like you're not registered yet.\n\n` +
          `Ask the admin to add your number,\n` +
          `then you're good to go 💪`
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
        `SELECT created_at, type, reps, sets, weight FROM workouts 
         WHERE user = ? 
         ORDER BY created_at DESC 
         LIMIT 10`
      );
      const rows = stmt.all(msg.author ?? msg.from) as Array<{
        created_at: string;
        type: string;
        reps: number;
        sets: number;
        weight: number;
      }>;

      if (rows.length === 0) {
        await safeReply(msg,
          `Nothing logged yet 👀\n\n` +
          `Start with:\n` +
          `#workout\n\n` +
          `Let's get the first one in 💪`
        );
        return;
      }

      // Detect user's timezone from message timestamp
      const msgTimestamp = msg.timestamp * 1000; // Convert to milliseconds
      const msgDate = new Date(msgTimestamp);
      const userTimezoneOffset = -msgDate.getTimezoneOffset(); // Minutes offset from UTC
      
      const list = rows
        .map((r) => {
          // Convert UTC timestamp to user's timezone
          const workoutDate = new Date(r.created_at);
          const userWorkoutDate = new Date(workoutDate.getTime() + userTimezoneOffset * 60000);
          
          // Get today and yesterday in user's timezone
          const userNow = new Date(Date.now() + userTimezoneOffset * 60000);
          const userToday = new Date(userNow.getFullYear(), userNow.getMonth(), userNow.getDate());
          const userYesterday = new Date(userToday.getTime() - 86400000);
          const workoutDateOnly = new Date(userWorkoutDate.getFullYear(), userWorkoutDate.getMonth(), userWorkoutDate.getDate());
          
          let dateStr: string;
          if (workoutDateOnly.getTime() === userToday.getTime()) {
            dateStr = 'Today';
          } else if (workoutDateOnly.getTime() === userYesterday.getTime()) {
            dateStr = 'Yesterday';
          } else {
            const [year, month, day] = r.created_at.split('T')[0].split('-');
            dateStr = `${year}/${month}/${day}`;
          }
          
          const weightStr = r.weight === 0 ? 'bodyweight' : `${r.weight}kg`;
          return `• ${dateStr} – ${r.type} | ${r.reps} × ${r.sets} @ ${weightStr}`;
        })
        .join('\n');
      
      console.log(`📋 Listed ${rows.length} workouts`);
      await safeReply(msg,
        `Recent work 💪\n\n` +
        `${list}`
      );
      return;
    }

    if (text.startsWith('#workout')) {
      const data = parseKeyValue(text);

      if (!data.type || !data.reps || !data.sets) {
        await safeReply(msg,
          'Hmm 🤔 that didn\'t go through.\n\n' +
          'Use this format:\n' +
          '#workout\n' +
          'type: push up\n' +
          'reps: 20\n' +
          'sets: 4\n' +
          'weight: 10 (optional)\n\n' +
          `(weight is in kg, leave it blank for bodyweight)\n\n` +
          `Try again 💪`
        );
        return;
      }

      const now = new Date();
      const weight = data.weight ? Number(data.weight) : 0;
      const weightLabel = weight === 0 ? 'bodyweight' : `${weight}kg`;

      const stmt = db.prepare(
        `INSERT INTO workouts (user, type, reps, sets, weight, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      stmt.run(
        msg.author ?? msg.from,
        data.type,
        Number(data.reps),
        Number(data.sets),
        weight,
        now.toISOString()
      );

      console.log(`💾 Workout saved: ${data.type} ${data.reps}×${data.sets} @ ${weightLabel}`);
      await safeReply(msg, `Logged 💪\n${data.type}\n${data.reps} × ${data.sets} @ ${weightLabel}\n\nNice work.`);
    }
  } catch (err) {
    console.error('❌ Error handling message:', err);
  }
}

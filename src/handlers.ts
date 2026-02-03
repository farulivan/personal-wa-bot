import pkg from 'whatsapp-web.js';
type Message = pkg.Message;
import { parseKeyValue } from './parser.js';
import { db } from './db.js';
import { isAllowedUser } from './config.js';
import { client } from './bot.js';
import { debug, error } from './logger.js';

// User timezone offset in minutes (UTC+7 = 420 minutes)
const USER_TIMEZONE_OFFSET = 420;

// Safe reply function that handles whatsapp-web.js compatibility issues
async function safeReply(msg: Message, text: string): Promise<void> {
  debug('📤 safeReply called, sending to:', msg.from);
  debug('📤 Message preview:', text.substring(0, 50) + '...');
  try {
    // Try sendMessage with sendSeen disabled
    await client.sendMessage(msg.from, text, { sendSeen: false });
    debug('✅ Message sent successfully via sendMessage');
  } catch (err) {
    debug('⚠️ sendMessage error:', err);
    debug('⚠️ sendMessage with sendSeen:false failed, trying chat.sendMessage');
    try {
      const chat = await msg.getChat();
      await chat.sendMessage(text);
    } catch (err2) {
      debug('⚠️ chat.sendMessage failed, trying msg.reply');
      try {
        await msg.reply(text);
      } catch (err3) {
        error('❌ All send methods failed. Message content:', text);
      }
    }
  }
}

export async function handleMessage(msg: Message): Promise<void> {
  debug('\n📨 ========== MESSAGE RECEIVED ==========');
  debug('📨 From:', msg.from);
  debug('📨 Author:', msg.author);
  debug('📨 Body:', msg.body?.substring(0, 100));
  debug('📨 ========================================\n');
  
  try {
    let text = msg.body.trim();
    const textLower = text.toLowerCase();
    const isGroup = msg.from.endsWith('@g.us');
    const sender = msg.author ?? msg.from;
    
    debug('🔍 Parsed: text="' + text.substring(0, 50) + '", isGroup=' + isGroup + ', sender=' + sender);
    
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
      debug(`👋 Greeting from ${sender}`);
      
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
        debug(`👥 Group message with bot mention, cleaned text: ${text}`);
      }
    }

    if (!text.startsWith('#')) {
      debug('⏭️ Skipping: message does not start with #');
      return;
    }
    debug('✅ Message starts with #, processing command...');

    // Security: Only allow whitelisted phone numbers
    debug('🔐 Checking if user is allowed...');
    if (!isAllowedUser(sender)) {
      debug(`🚫 Blocked message from unauthorized user: ${sender}`);
      return;
    }
    debug('✅ User is allowed, continuing...');
    
    if (isGroup) {
      debug(`👥 Processing group message from ${sender}`);
    }

    debug('🎯 Checking command: "' + text + '"');
    
    if (text === '#list') {
      debug('📋 Handling #list command...');
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

      const list = rows
        .map((r) => {
          // Convert UTC timestamp to user's timezone
          const workoutDate = new Date(r.created_at);
          const userWorkoutDate = new Date(workoutDate.getTime() + USER_TIMEZONE_OFFSET * 60000);
          
          // Get today and yesterday in user's timezone
          const userNow = new Date(Date.now() + USER_TIMEZONE_OFFSET * 60000);
          const userToday = new Date(userNow.getUTCFullYear(), userNow.getUTCMonth(), userNow.getUTCDate());
          const userYesterday = new Date(userToday.getTime() - 86400000);
          const workoutDateOnly = new Date(userWorkoutDate.getUTCFullYear(), userWorkoutDate.getUTCMonth(), userWorkoutDate.getUTCDate());
          
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
      
      debug(`📋 Listed ${rows.length} workouts`);
      await safeReply(msg,
        `Recent work 💪\n\n` +
        `${list}`
      );
      return;
    }

    if (text.startsWith('#workout')) {
      debug('🏋️ Handling #workout command...');
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

      // Get user's local time using configured timezone
      const userNow = new Date(Date.now() + USER_TIMEZONE_OFFSET * 60000);
      const userHour = userNow.getUTCHours();

      // Dynamic response based on time of day
      let timeResponse: string;
      if (userHour >= 5 && userHour < 11) {
        timeResponse = 'Early grind 💯\nStarting the day right.';
      } else if (userHour >= 11 && userHour < 16) {
        timeResponse = 'Midday work 👊\nStaying consistent.';
      } else if (userHour >= 16 && userHour < 21) {
        timeResponse = 'After-hours effort 💪\nWay to show up.';
      } else {
        timeResponse = 'Late session 👀\nThat\'s commitment.';
      }

      debug(`💾 Workout saved: ${data.type} ${data.reps}×${data.sets} @ ${weightLabel}`);
      await safeReply(msg, `Logged 💪\n${data.type}\n${data.reps} × ${data.sets} @ ${weightLabel}\n\n${timeResponse}`);
    }
  } catch (err) {
    error('❌ Error handling message:', err);
  }
}

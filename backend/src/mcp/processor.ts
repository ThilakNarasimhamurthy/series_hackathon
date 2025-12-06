import { KafkaEvent, MoodCheckinEvent, JournalEntryEvent, CrisisSignalEvent, HelpRequestEvent, SeriesKafkaEvent, MessageReceivedEvent } from '../kafka/types.js';
import { createOrGetUser, createCheckin, getLast7Checkins, createJournalEntry, markUserOnboarded, createChat, getChatBySeriesId, findAvailableResponder, createRiskAlert } from '../db/queries.js';
import { seriesClient } from '../api/seriesClient.js';
import { checkChatRateLimit } from '../middleware/chatRateLimiter.js';
import { analyzeMoodTrend, getAIRecommendation, analyzeSentiment, extractKeywords, detectCrisisKeywords } from './analysis.js';
import { sanitizeErrorMessage } from '../utils/sanitize.js';

// Message deduplication - track processed messages
const processedMessages = new Set<string>();
const MESSAGE_TTL = 5 * 60 * 1000; // 5 minutes

function isMessageProcessed(eventId: string): boolean {
  return processedMessages.has(eventId);
}

function markMessageProcessed(eventId: string): void {
  processedMessages.add(eventId);
  setTimeout(() => {
    processedMessages.delete(eventId);
  }, MESSAGE_TTL);
}

/**
 * Main Event Processor
 * Processes events from Kafka - handles both Series API events and internal events
 */
export async function processEvent(event: KafkaEvent | SeriesKafkaEvent): Promise<void> {
  console.log(`\n🔄 Processing event: ${event.event_type}`);
  console.log('   Event data:', JSON.stringify(event, null, 2));

  try {
    // Handle Series API events
    if ('api_version' in event) {
      await handleSeriesEvent(event as SeriesKafkaEvent);
      return;
    }

    // Handle internal events
    switch (event.event_type) {
      case 'mood_checkin':
        await handleMoodCheckin(event as MoodCheckinEvent);
        break;

      case 'journal_entry':
        await handleJournalEntry(event as JournalEntryEvent);
        break;

      case 'crisis_signal':
        await handleCrisisSignal(event as CrisisSignalEvent);
        break;

      case 'help_request':
        await handleHelpRequest(event as HelpRequestEvent);
        break;

      default:
        console.log(`⚠️  Unknown event type: ${event.event_type}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${event.event_type} event:`, error);
    throw error;
  }
}

/**
 * Handle Series API events (message.received, typing indicators, etc.)
 */
async function handleSeriesEvent(event: SeriesKafkaEvent) {
  console.log(`\n📡 Handling Series API event: ${event.event_type}`);
  console.log(`   API Version: ${event.api_version}`);
  console.log(`   Event ID: ${event.event_id}`);
  console.log(`   Created At: ${event.created_at}`);
  
  switch (event.event_type) {
    case 'message.received':
      console.log(`   → Routing to handleIncomingMessage`);
      await handleIncomingMessage(event as MessageReceivedEvent);
      break;

    case 'typing_indicator.received':
    case 'typing_indicator.removed':
      // Handle typing indicators if needed
      console.log(`📝 Typing indicator: ${event.event_type}`);
      break;

    default:
      console.log(`⚠️  Unhandled Series event type: ${event.event_type}`);
      console.log(`   Full event:`, JSON.stringify(event, null, 2));
  }
}

/**
 * Handle incoming messages from users via Series API
 */
async function handleIncomingMessage(event: MessageReceivedEvent) {
  const { data } = event;
  const { text, from_phone, chat_id } = data;

  // 1. Check message deduplication
  const eventId = event.event_id || `${chat_id}-${text.substring(0, 50)}-${Date.now()}`;
  if (isMessageProcessed(eventId)) {
    console.log(`   ⏭️  Skipping duplicate message (event_id: ${event.event_id || 'generated'})`);
    return;
  }
  markMessageProcessed(eventId);

  // 2. Check chat rate limit (1 message per 30 seconds - ensures Series API is called only after 30 seconds)
  if (!checkChatRateLimit(chat_id)) {
    console.log(`   ⏭️  Rate limit exceeded for chat ${chat_id} - Series API can only be called once per 30 seconds`);
    return;
  }

  console.log(`📨 Incoming message from ${from_phone}: "${text}"`);
  console.log(`   Chat ID: ${chat_id}`);
  console.log(`   Our sender number: ${process.env.SERIES_SENDER_NUMBER}`);
  
  // 3. Check if message is from us (the bot) based on chat_handles
  const senderHandle = data.chat_handles?.find((handle: any) => 
    handle.identifier === from_phone
  );
  
  if (senderHandle?.is_me === true) {
    console.log(`   ⏭️  Skipping message - sent by us (is_me=true)`);
    return;
  }
  
  // Also check if from_phone matches our sender number (double check)
  if (from_phone === process.env.SERIES_SENDER_NUMBER) {
    console.log(`   ⏭️  Skipping message - from_phone matches our sender number`);
    return;
  }

  // 4. Skip bot messages by content patterns
  const botMessagePatterns = [
    'Welcome to Series Emotional Support',
    "I'm here and listening",
    "I'm here to help",
    "Thank you for checking in",
    "I'm here for you",
    "Crisis resources: 988",
    "I'm connecting you",
    "Hello! I'm here to help",
    "Here's how this works",
  ];
  
  if (botMessagePatterns.some(pattern => text.includes(pattern))) {
    console.log(`   ⏭️  Skipping bot message (detected by content)`);
    return;
  }
  
  console.log(`   ✅ Processing message from user: ${from_phone}`);

  // Get or create user
  const user = await createOrGetUser(from_phone);
  const chatIdInt = parseInt(chat_id);
  
  // Check if this is a new user (not onboarded yet)
  const isNewUser = !user.onboarded || !user.first_message_at;

  // Store chat ID in database if not exists
  let dbChat = await getChatBySeriesId(chat_id);
  if (!dbChat) {
    dbChat = await createChat(user.id, null, 'general', { series_chat_id: chat_id });
  }
  
  // Update first_message_at if this is their first message
  if (!user.first_message_at) {
    const { query } = await import('../db/index.js');
    await query('UPDATE users SET first_message_at = NOW() WHERE id = $1', [user.id]);
  }

  // Parse message content
  const messageLower = text.toLowerCase().trim();

  // Check for mood emojis
  const moodEmojis: Record<string, string> = {
    '😊': '😊', '😄': '😊', '🙂': '😊',
    '😐': '😐', '😕': '😐',
    '😞': '😞', '😢': '😞', '😰': '😰', '🆘': '🆘'
  };

  const detectedMood = Object.keys(moodEmojis).find(emoji => text.includes(emoji));
  
  // Track if response was sent
  let responseSent = false;
  
  if (detectedMood) {
    // Handle as mood check-in
    try {
      await handleMoodCheckin({
        event_type: 'mood_checkin',
        user_id: user.id,
        timestamp: new Date().toISOString(),
        payload: {
          mood: detectedMood,
          phone: from_phone,
          chat_id: chat_id // Pass chat_id for replies
        }
      } as MoodCheckinEvent);
      responseSent = true; // Response sent in handleMoodCheckin
      
      // Send onboarding for new users after first response
      if (isNewUser && !user.onboarded) {
        await sendOnboardingMessage(from_phone, chat_id, user.id);
      }
    } catch (error) {
      console.error('❌ Error handling mood check-in:', error);
      // Only send fallback if no response was sent
      if (!responseSent) {
        try {
          await sendMessageToUser(from_phone, "Thank you for checking in. How are you feeling?", chat_id);
          responseSent = true;
          
          // Send onboarding for new users after first response
          if (isNewUser && !user.onboarded) {
            await sendOnboardingMessage(from_phone, chat_id, user.id);
          }
        } catch (sendError) {
          console.error('❌ Failed to send fallback mood response:', sendError);
        }
      }
    }
    return;
  }

  // Check for crisis keywords
  if (detectCrisisKeywords(text)) {
    try {
      await handleCrisisSignal({
        event_type: 'crisis_signal',
        user_id: user.id,
        timestamp: new Date().toISOString(),
        payload: {
          reason: 'crisis_keywords',
          content: text,
          severity: 'high',
          phone: from_phone,
          chat_id: chat_id // Pass chat_id for replies
        }
      } as CrisisSignalEvent);
      responseSent = true; // Response sent in handleCrisisSignal
      
      // Send onboarding for new users after first response (but skip for crisis - they need immediate help)
      // Onboarding will be sent on next non-crisis message
    } catch (error) {
      console.error('❌ Error handling crisis signal:', error);
      // Fallback response sent in handleCrisisSignal if needed
      responseSent = true;
    }
    return;
  }

  // Check for help requests
  const helpKeywords = ['help', 'support', 'talk', 'someone'];
  if (helpKeywords.some(keyword => messageLower.includes(keyword))) {
    try {
      await handleHelpRequest({
        event_type: 'help_request',
        user_id: user.id,
        timestamp: new Date().toISOString(),
        payload: {
          message: text,
          phone: from_phone,
          chat_id: chat_id // Pass chat_id for replies
        }
      } as HelpRequestEvent);
      responseSent = true; // Response sent in handleHelpRequest
      
      // Send onboarding for new users after first response
      if (isNewUser && !user.onboarded) {
        await sendOnboardingMessage(from_phone, chat_id, user.id);
      }
    } catch (error) {
      console.error('❌ Error handling help request:', error);
      // Only send fallback if no response was sent
      if (!responseSent) {
        try {
          await sendMessageToUser(from_phone, "I'm here to help. How can I support you today?", chat_id);
          responseSent = true;
          
          // Send onboarding for new users after first response
          if (isNewUser && !user.onboarded) {
            await sendOnboardingMessage(from_phone, chat_id, user.id);
          }
        } catch (sendError) {
          console.error('❌ Failed to send fallback help response:', sendError);
        }
      }
    }
    return;
  }

  // Default: treat as journal entry
  try {
    await handleJournalEntry({
      event_type: 'journal_entry',
      user_id: user.id,
      timestamp: new Date().toISOString(),
      payload: {
        content: text,
        source: 'imessage',
        phone: from_phone,
        chat_id: chat_id // Pass chat_id for replies
      }
    } as JournalEntryEvent);
    responseSent = true; // Response sent in handleJournalEntry (if sentiment allows)
    
    // Send onboarding for new users after first response
    if (isNewUser && !user.onboarded && responseSent) {
      await sendOnboardingMessage(from_phone, chat_id, user.id);
    }
  } catch (error) {
    console.error('❌ Error handling journal entry:', error);
  }
  
  // Only send fallback response if no response was sent yet
  // This prevents API flooding and message loops
  if (!responseSent) {
    try {
      const defaultResponse = "I'm here and listening. How can I support you today?";
      await sendMessageToUser(from_phone, defaultResponse, chat_id);
      responseSent = true;
      
      // Send onboarding for new users after first response
      if (isNewUser && !user.onboarded) {
        await sendOnboardingMessage(from_phone, chat_id, user.id);
      }
    } catch (error) {
      console.error('❌ Failed to send default response:', error);
      // Don't retry - avoid API flooding
    }
  }
}

/**
 * Send onboarding explanation message to new users
 */
async function sendOnboardingMessage(phone: string, chatId: string, userId: string): Promise<void> {
  try {
    // Wait a bit before sending follow-up (to avoid rate limits)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const onboardingMessage = `Here's how this works:

• Send me an emoji to check in (😊 😐 😞 😰 🆘)
• Or just text me anything - I'm here to listen
• Type "crisis" if you need immediate help
• Everything stays private and anonymous

What's on your mind?`;
    
    await sendMessageToUser(phone, onboardingMessage, chatId);
    
    // Mark user as onboarded after sending explanation
    await markUserOnboarded(userId);
    console.log(`   ✅ User ${phone} marked as onboarded`);
  } catch (error) {
    console.error('❌ Failed to send onboarding message:', error);
    // Still mark as onboarded to avoid retrying
    try {
      await markUserOnboarded(userId);
    } catch (markError) {
      console.error('❌ Failed to mark user as onboarded:', markError);
    }
  }
}

/**
 * Handle mood check-in events
 */
async function handleMoodCheckin(event: MoodCheckinEvent) {
  const { user_id, payload } = event;
  const { mood, tags = [], text = null, phone } = payload;

  console.log(`📊 Processing mood check-in: ${mood}`);

  // Get or create user
  let userId: string | undefined = user_id;
  let userPhone: string | undefined = phone;
  if (phone) {
    const user = await createOrGetUser(phone);
    userId = user.id;
    userPhone = user.phone || phone;
    console.log(`   User ID: ${userId} (from phone: ${phone})`);
  } else if (userId) {
    // Get user phone from database
    const { getUserById } = await import('../db/queries.js');
    const user = await getUserById(userId);
    if (user && user.phone) {
      userPhone = user.phone;
    }
  } else {
    throw new Error('No user_id or phone provided in mood check-in event');
  }

  if (!userId) {
    throw new Error('Failed to get user ID');
  }

  // Store check-in
  await createCheckin(userId, mood, tags, text || null);
  console.log('✅ Check-in stored');

  // Get trend (last 7 check-ins)
  const recentCheckins = await getLast7Checkins(userId);
  const moods = recentCheckins.map(c => c.mood);
  console.log(`   Recent moods: ${moods.join(', ')}`);

  // Analyze trend
  const trend = analyzeMoodTrend(moods);
  console.log(`   Trend: ${trend.trend}, Severity: ${trend.severity}`);

  // Generate AI response
  const recommendation = getAIRecommendation(mood, trend);
  console.log(`   AI Recommendation: ${recommendation.substring(0, 50)}...`);

  // Send response via Series API
  if (userPhone) {
    // Use chat_id from payload if available (from incoming message)
    const chatId = payload.chat_id;
    await sendMessageToUser(userPhone, recommendation, chatId);
  } else {
    console.warn('⚠️  Cannot send message: no phone number available');
  }

  // If declining trend, create risk alert
  if (trend.isDeclining && trend.severity === 'high') {
    console.log('🚨 High severity declining trend detected');
    await createRiskAlert(userId, null, null, 'high', {
      reason: 'declining_mood_trend',
      recent_moods: moods
    });
  }
}

/**
 * Handle journal entry events
 */
async function handleJournalEntry(event: JournalEntryEvent) {
  const { user_id, payload } = event;
  const { content, phone } = payload;

  console.log(`📝 Processing journal entry`);

  // Get or create user
  let userId: string | undefined = user_id;
  let userPhone: string | undefined = phone;
  if (phone) {
    const user = await createOrGetUser(phone);
    userId = user.id;
    userPhone = user.phone || phone;
  } else if (userId) {
    const { getUserById } = await import('../db/queries.js');
    const user = await getUserById(userId);
    if (user && user.phone) {
      userPhone = user.phone;
    }
  } else {
    throw new Error('No user_id or phone provided in journal entry event');
  }

  if (!userId) {
    throw new Error('Failed to get user ID');
  }

  // Analyze sentiment
  const sentiment = analyzeSentiment(content);
  const keywords = extractKeywords(content);
  console.log(`   Sentiment: ${sentiment}, Keywords: ${keywords.join(', ')}`);

  // Store journal entry
  await createJournalEntry(userId, content, sentiment, keywords);
  console.log('✅ Journal entry stored');

  // Check for crisis keywords
  if (detectCrisisKeywords(content)) {
    console.log('🚨 Crisis keywords detected in journal entry');
    await handleCrisisSignal({
      event_type: 'crisis_signal',
      user_id: userId,
      timestamp: new Date().toISOString(),
      payload: {
        reason: 'crisis_keywords',
        content: content,
        severity: 'high',
        phone: userPhone
      }
    } as CrisisSignalEvent);
  } else {
    // Send supportive response
    if (userPhone) {
      const response = "Thank you for sharing. Journaling is a powerful tool for processing emotions.";
      // Use chat_id from payload if available (from incoming message)
      const chatId = payload.chat_id;
      await sendMessageToUser(userPhone, response, chatId);
    }
  }
}

/**
 * Handle crisis signal events
 */
async function handleCrisisSignal(event: CrisisSignalEvent) {
  const { user_id, payload } = event;
  const { reason, content, severity, phone } = payload;

  console.log(`🚨 Processing crisis signal: ${reason}, Severity: ${severity}`);

  // Get or create user
  let userId: string | undefined = user_id;
  let userPhone: string | undefined = phone;
  if (phone) {
    const user = await createOrGetUser(phone);
    userId = user.id;
    userPhone = user.phone || phone;
  } else if (userId) {
    const { getUserById } = await import('../db/queries.js');
    const user = await getUserById(userId);
    if (user && user.phone) {
      userPhone = user.phone;
    }
  } else {
    throw new Error('No user_id or phone provided in crisis signal event');
  }

  if (!userId) {
    throw new Error('Failed to get user ID');
  }

  if (!userPhone) {
    throw new Error('No phone number available for crisis escalation');
  }

  // Find available responder
  const responder = await findAvailableResponder('crisis');
  
  if (responder) {
    // Create chat session via Series API
    try {
      const chat = await seriesClient.createChatWithMessage(
        [userPhone],
        "I'm connecting you with a trained responder right now. You're not alone.",
        'Crisis Support'
      );

      // Store in database
      await createChat(userId, responder.id, 'crisis', {
        series_chat_id: chat.id.toString(),
        reason: reason,
        severity: severity
      });

      // Create risk alert
      await createRiskAlert(userId, responder.id, null, severity, {
        reason: reason,
        content: content,
        chat_id: chat.id
      });

      console.log('✅ Crisis escalation: Responder matched, chat created');
    } catch (error) {
      console.error('❌ Failed to create crisis chat:', error);
      // Send fallback message with chat_id
      const chatId = payload.chat_id;
      await sendMessageToUser(userPhone, "I'm here for you. Crisis resources: 988 Suicide & Crisis Lifeline. We're working to connect you with someone.", chatId);
    }
  } else {
    // No responder available - send crisis resources with chat_id
    const chatId = payload.chat_id;
    await sendMessageToUser(userPhone, "I'm here for you. Crisis resources: 988 Suicide & Crisis Lifeline (call or text). We're working to connect you with someone.", chatId);
    console.log('⚠️  No available responder found for crisis');
  }
}

/**
 * Handle help request events
 */
async function handleHelpRequest(event: HelpRequestEvent) {
  const { user_id, payload } = event;
  const { message, phone } = payload;

  console.log(`🆘 Processing help request`);

  // Get or create user
  let userId: string | undefined = user_id;
  let userPhone: string | undefined = phone;
  if (phone) {
    const user = await createOrGetUser(phone);
    userId = user.id;
    userPhone = user.phone || phone;
  } else if (userId) {
    const { getUserById } = await import('../db/queries.js');
    const user = await getUserById(userId);
    if (user && user.phone) {
      userPhone = user.phone;
    }
  } else {
    throw new Error('No user_id or phone provided in help request event');
  }

  if (!userId) {
    throw new Error('Failed to get user ID');
  }

  if (!userPhone) {
    console.warn('⚠️  No phone number available for help request');
    return;
  }

  // Find available responder
  const responder = await findAvailableResponder('peer');
  
  if (responder) {
    try {
      const chat = await seriesClient.createChatWithMessage(
        [userPhone],
        "I'm connecting you with a peer supporter.",
        'Peer Support'
      );

      await createChat(userId, responder.id, 'peer', {
        series_chat_id: chat.id.toString()
      });

      console.log('✅ Help request: Responder matched, chat created');
    } catch (error) {
      console.error('❌ Failed to create help chat:', error);
      const chatId = payload.chat_id;
      await sendMessageToUser(userPhone, "I'm here to help. How can I support you today?", chatId);
    }
  } else {
    const chatId = payload.chat_id;
    await sendMessageToUser(userPhone, "I'm here to help. How can I support you today?", chatId);
  }
}

/**
 * Send message to user via Series API
 * Uses chatId if provided, otherwise finds or creates chat
 */
async function sendMessageToUser(phone: string, message: string, chatId?: string | number): Promise<void> {
  if (!phone) {
    console.warn('⚠️  Cannot send message: no phone number provided');
    return;
  }

  try {
    // If we have a chat ID from the incoming message, use it directly
    if (chatId) {
      const chatIdNum = typeof chatId === 'string' ? parseInt(chatId) : chatId;
      console.log(`📤 Sending message to chat ${chatIdNum} for user ${phone}`);
      console.log(`   Message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
      await seriesClient.sendTextMessage(chatIdNum, message);
      console.log(`✅ Successfully sent message to chat ${chatIdNum}`);
      return;
    }

    // Otherwise, try to find existing chat
    console.log(`🔍 No chat_id provided, searching for existing chat for ${phone}`);
    let chat = await seriesClient.findChat(phone);
    
    if (!chat) {
      // Create new chat with message
      console.log(`📝 No existing chat found, creating new chat for ${phone}`);
      chat = await seriesClient.createChatWithMessage([phone], message);
      console.log(`✅ Created new chat ${chat.id} and sent message`);
    } else {
      // Send message to existing chat
      console.log(`📤 Found existing chat ${chat.id}, sending message`);
      await seriesClient.sendTextMessage(chat.id, message);
      console.log(`✅ Sent message to existing chat ${chat.id}`);
    }
  } catch (error: any) {
    // Sanitize error logging to prevent API key exposure
    const safeMessage = sanitizeErrorMessage(error);
    console.error(`❌ Failed to send message to user ${phone}:`, safeMessage);
    if (error.response) {
      // Only log safe error data (no API keys or sensitive info)
      const safeData = error.response.data?.message || 'API request failed';
      console.error('   API Error:', {
        status: error.response.status,
        message: safeData
        // Don't log full response.data which might contain sensitive info
      });
    }
    // Don't throw - we don't want to crash the processor
    console.error('   Continuing processing despite send error');
  }
}

// Analysis functions are now imported from ./analysis.js

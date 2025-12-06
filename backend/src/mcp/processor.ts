import { KafkaEvent, MoodCheckinEvent, JournalEntryEvent, CrisisSignalEvent, HelpRequestEvent, SeriesKafkaEvent, MessageReceivedEvent } from '../kafka/types.js';
import { createOrGetUser, createCheckin, getLast7Checkins, createJournalEntry, markUserOnboarded, createChat, getChatBySeriesId, getActiveChatByUserId, findAvailableResponder, createRiskAlert, getActiveChatByUserAndResponder } from '../db/queries.js';
import { seriesClient } from '../api/seriesClient.js';
import { checkChatRateLimit, queueMessage } from '../middleware/chatRateLimiter.js';
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

  // Check chat rate limit (1 message per 30 seconds per chat)
  const chatIdStr = chat_id.toString();
  const rateLimitCheck = checkChatRateLimit(chatIdStr, false);
  
  if (!rateLimitCheck.canProcess) {
    console.log(`⚠️  Rate limit: Chat ${chatIdStr} exceeded rate limit. Queueing message...`);
    queueMessage(chatIdStr, event);
    return; // Message will be processed after rate limit expires
  }
  
  // Mark rate limit as used (update timestamp) since we're processing this message now
  checkChatRateLimit(chatIdStr, true);
  
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

  // ✅ STEP 1: Get or create user in database (parallel with chat lookup)
  console.log(`   📝 Step 1: Verifying/Creating user and checking chat in parallel...`);
  const [user, existingChat] = await Promise.all([
    createOrGetUser(from_phone),
    getChatBySeriesId(chat_id)
  ]);
  console.log(`   ✅ User verified/created: ${user.id} (phone: ${user.phone}, onboarded: ${user.onboarded})`);
  
  const chatIdInt = parseInt(chat_id);
  
  // Check if this is a new user (not onboarded yet)
  const isNewUser = !user.onboarded || !user.first_message_at;
  if (isNewUser) {
    console.log(`   🆕 New user detected - will send onboarding after first response`);
  }

  // ✅ STEP 2: Store chat ID in database if not exists
  let dbChat = existingChat;
  if (!dbChat) {
    // Check if there's already an active chat for this user (prevent duplicates)
    const existingActiveChat = await getActiveChatByUserId(user.id);
    if (existingActiveChat) {
      // Reuse existing active chat and update series_chat_id if needed
      dbChat = existingActiveChat;
      if (!dbChat.series_chat_id || dbChat.series_chat_id !== chat_id) {
        const { query } = await import('../db/index.js');
        await query('UPDATE chats SET series_chat_id = $1 WHERE id = $2', [chat_id, dbChat.id]);
        dbChat.series_chat_id = chat_id;
        console.log(`   ✅ Reused existing active chat ${dbChat.id} and updated series_chat_id to ${chat_id}`);
      } else {
        console.log(`   ✅ Reused existing active chat ${dbChat.id} (series_chat_id already matches)`);
      }
    } else {
      // No existing active chat - create new one
      dbChat = await createChat(user.id, null, 'general', { series_chat_id: chat_id });
      console.log(`   ✅ Chat created in database: ${dbChat.id} (series_chat_id: ${chat_id})`);
    }
  } else {
    console.log(`   ✅ Chat already exists in database: ${dbChat.id}`);
    
    // Check if chat session is ended - if so, AI agent should handle (responder_id should be null)
    if (dbChat.status === 'ended' || dbChat.status === 'archived') {
      console.log(`   ℹ️  Chat session is ended - AI agent will handle this message`);
      // Ensure responder_id is cleared so AI handles it
      if (dbChat.responder_id) {
        const { query } = await import('../db/index.js');
        await query('UPDATE chats SET responder_id = NULL WHERE id = $1::uuid', [dbChat.id]);
        dbChat.responder_id = null; // Update local reference
        console.log(`   ✅ Cleared responder_id - AI agent will handle`);
      }
    }
    
    // Refresh chat data from database to get latest responder_id (in case it was updated)
    const { getChatById } = await import('../db/queries.js');
    const refreshedChat = await getChatById(dbChat.id, false);
    if (refreshedChat) {
      dbChat = refreshedChat;
      console.log(`   🔄 Refreshed chat data - responder_id: ${dbChat.responder_id || 'NULL'}`);
    }
  }
  
  // ✅ CRITICAL: Check if human responder is assigned - if so, disable AI and return early
  // Only process with AI if responder_id is NULL (no human in the loop)
  // When session is ended, responder_id should be NULL, so AI will handle
  if (dbChat.responder_id && dbChat.status !== 'ended' && dbChat.status !== 'archived') {
    console.log(`   👤 Human responder is assigned (responder_id: ${dbChat.responder_id}) - AI disabled`);
    console.log(`   ℹ️  Message received but not processed by AI. Responder will handle this conversation.`);
    // Still update first_message_at for tracking purposes
    if (!user.first_message_at) {
      const { query } = await import('../db/index.js');
      query('UPDATE users SET first_message_at = NOW() WHERE id = $1', [user.id])
        .then(() => console.log(`   ✅ First message timestamp updated for user ${user.id}`))
        .catch(err => console.error(`   ⚠️  Failed to update first_message_at:`, err));
    }
    // Return early - do not process with AI when human responder is active
    return;
  }
  
  console.log(`   🤖 No human responder assigned (or session ended) - AI agent will process this message`);
  
  // Update first_message_at if this is their first message (non-blocking)
  if (!user.first_message_at) {
    const { query } = await import('../db/index.js');
    // Don't await - let it run in background to speed up processing
    query('UPDATE users SET first_message_at = NOW() WHERE id = $1', [user.id])
      .then(() => console.log(`   ✅ First message timestamp updated for user ${user.id}`))
      .catch(err => console.error(`   ⚠️  Failed to update first_message_at:`, err));
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
  const hasCrisisKeywords = detectCrisisKeywords(text);
  console.log(`🔍 Crisis keyword check for message: "${text.substring(0, 100)}..." -> ${hasCrisisKeywords ? '🚨 CRISIS DETECTED' : 'no crisis keywords'}`);
  
  if (hasCrisisKeywords) {
    console.log('🚨 CRISIS DETECTED! Processing crisis signal...');
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
      console.log('✅ Crisis signal handled successfully');
      
      // Send onboarding for new users after first response (but skip for crisis - they need immediate help)
      // Onboarding will be sent on next non-crisis message
    } catch (error) {
      console.error('❌ Error handling crisis signal:', sanitizeErrorMessage(error));
      console.error('   Full error details:', error);
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
      console.error('❌ Error handling help request:', sanitizeErrorMessage(error));
      // Only send fallback if no response was sent
      if (!responseSent) {
        try {
          // Try to generate AI response even for help requests that failed
          const { generateAIResponse } = await import('./aiService.js');
          const { getLast7Checkins } = await import('../db/queries.js');
          
          const recentCheckins = await getLast7Checkins(user.id);
          const recentMoods = recentCheckins.map(c => c.mood);
          const moodTrend = analyzeMoodTrend(recentMoods);
          const sentiment = analyzeSentiment(text);
          
          const aiResponse = await generateAIResponse({
            userMessage: text,
            userPhone: from_phone,
            recentMoods: recentMoods,
            sentiment: sentiment,
            moodTrend: moodTrend
          });
          
          await sendMessageToUser(from_phone, aiResponse, chat_id);
          responseSent = true;
          console.log(`✅ AI-generated response sent for help request fallback`);
          
          // Send onboarding for new users after first response
          if (isNewUser && !user.onboarded) {
            await sendOnboardingMessage(from_phone, chat_id, user.id);
          }
        } catch (aiError) {
          console.error('❌ Failed to generate AI response for help request:', sanitizeErrorMessage(aiError));
          // Final fallback
          try {
            await sendMessageToUser(from_phone, "I'm here to help. How can I support you today?", chat_id);
            responseSent = true;
            
            if (isNewUser && !user.onboarded) {
              await sendOnboardingMessage(from_phone, chat_id, user.id);
            }
          } catch (sendError) {
            console.error('❌ Failed to send fallback help response:', sanitizeErrorMessage(sendError));
          }
        }
      }
    }
    return;
  }

  // Default: treat as journal entry
  try {
    const journalResponseSent = await handleJournalEntry({
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
    responseSent = journalResponseSent || false; // Only set to true if response was actually sent
    
    // Send onboarding for new users after first response
    if (isNewUser && !user.onboarded && responseSent) {
      await sendOnboardingMessage(from_phone, chat_id, user.id);
    }
  } catch (error) {
    console.error('❌ Error handling journal entry:', sanitizeErrorMessage(error));
    responseSent = false; // Ensure fallback can run if journal entry fails
  }
  
  // Only send fallback response if no response was sent yet
  // This prevents API flooding and message loops
  if (!responseSent) {
    try {
      // Generate AI-powered response using OpenAI
      const { generateAIResponse } = await import('./aiService.js');
      const { getLast7Checkins } = await import('../db/queries.js');
      
      // Get context for AI response (parallelize independent operations)
      const [recentCheckins] = await Promise.all([
        getLast7Checkins(user.id)
      ]);
      const recentMoods = recentCheckins.map(c => c.mood);
      const moodTrend = analyzeMoodTrend(recentMoods);
      const sentiment = analyzeSentiment(text); // Synchronous, no need to await
      
      console.log(`🔄 Calling generateAIResponse for message: "${text.substring(0, 50)}..."`);
      // Generate AI response
      const aiResponse = await generateAIResponse({
        userMessage: text,
        userPhone: from_phone,
        recentMoods: recentMoods,
        sentiment: sentiment,
        moodTrend: moodTrend
      });
      
      console.log(`📤 Attempting to send AI response to user ${from_phone}...`);
      console.log(`   AI Response preview: "${aiResponse.substring(0, 80)}..."`);
      const messageSent = await sendMessageToUser(from_phone, aiResponse, chat_id);
      
      if (messageSent) {
        responseSent = true;
        console.log(`✅ SUCCESS: AI-generated response sent to user ${from_phone}`);
      } else {
        console.error(`❌ FAILED: Could not send AI response to user ${from_phone}`);
        // Don't set responseSent = true, so fallback can try
      }
      
      // Send onboarding for new users after first response
      if (isNewUser && !user.onboarded) {
        await sendOnboardingMessage(from_phone, chat_id, user.id);
      }
    } catch (error) {
      console.error('❌ Error generating AI response:', sanitizeErrorMessage(error));
      // Fallback to default response
      try {
        const defaultResponse = "I'm here and listening. How can I support you today?";
        await sendMessageToUser(from_phone, defaultResponse, chat_id);
        responseSent = true;
        
        // Send onboarding for new users after first response
        if (isNewUser && !user.onboarded) {
          await sendOnboardingMessage(from_phone, chat_id, user.id);
        }
      } catch (sendError) {
        console.error('❌ Failed to send fallback response:', sanitizeErrorMessage(sendError));
        // Don't retry - avoid API flooding
      }
    }
  }
}

/**
 * Send onboarding explanation message to new users
 */
async function sendOnboardingMessage(phone: string, chatId: string, userId: string): Promise<void> {
  try {
    // Removed delay - rate limiting is handled by chatRateLimiter
    const onboardingMessage = `Here's how this works:

• Send me an emoji to check in (😊 😐 😞 😰 🆘)
• Or just text me anything - I'm here to listen
• Type "crisis" if you need immediate help
• Everything stays private and anonymous

What's on your mind?`;
    
    // Send onboarding and mark as onboarded in parallel
    await Promise.all([
      sendMessageToUser(phone, onboardingMessage, chatId),
      markUserOnboarded(userId)
    ]);
    
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
 * @returns true if a response was sent, false otherwise
 */
async function handleJournalEntry(event: JournalEntryEvent): Promise<boolean> {
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
        phone: userPhone,
        chat_id: payload.chat_id
      }
    } as CrisisSignalEvent);
    return true; // Crisis handler sends response
  } else {
    // Generate AI-powered response using OpenAI
    if (userPhone) {
      try {
        const { generateAIResponse } = await import('./aiService.js');
        const { getLast7Checkins } = await import('../db/queries.js');
        
        // Get context for AI response
        const recentCheckins = await getLast7Checkins(userId);
        const recentMoods = recentCheckins.map(c => c.mood);
        const moodTrend = analyzeMoodTrend(recentMoods);
        
        console.log(`🔄 Calling generateAIResponse for journal entry: "${content.substring(0, 50)}..."`);
        // Generate AI response
        const aiResponse = await generateAIResponse({
          userMessage: content,
          userPhone: userPhone,
          recentMoods: recentMoods,
          sentiment: sentiment,
          moodTrend: moodTrend
        });
        
        console.log(`📤 Attempting to send AI response for journal entry...`);
        console.log(`   AI Response preview: "${aiResponse.substring(0, 80)}..."`);
        // Use chat_id from payload if available (from incoming message)
        const chatId = payload.chat_id;
        const messageSent = await sendMessageToUser(userPhone, aiResponse, chatId);
        
        if (messageSent) {
          console.log(`✅ SUCCESS: AI-generated response sent for journal entry`);
          return true; // Response was sent successfully
        } else {
          console.error(`❌ FAILED: Could not send AI response for journal entry`);
          return false; // Response was not sent
        }
      } catch (error) {
        console.error('❌ Error generating AI response for journal entry:', sanitizeErrorMessage(error));
        // Fallback to supportive response
        try {
          const fallbackResponse = "Thank you for sharing. Journaling is a powerful tool for processing emotions.";
          const chatId = payload.chat_id;
          await sendMessageToUser(userPhone, fallbackResponse, chatId);
          console.log(`✅ Fallback response sent for journal entry`);
          return true; // Fallback response was sent
        } catch (sendError) {
          console.error('❌ Failed to send fallback response for journal entry:', sanitizeErrorMessage(sendError));
          return false; // No response was sent
        }
      }
    }
    return false; // No userPhone, couldn't send response
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

  // Always create an alert for crisis - don't auto-assign
  // Responders will accept alerts and continue in existing active chats if they have them
  console.log('🚨 Creating crisis alert for responder to accept...');
  const chatId = payload.chat_id;
  
  // Try to find or create a chat in the database (even without responder assignment)
  let dbChat = null;
  if (chatId) {
    dbChat = await getChatBySeriesId(chatId.toString());
    if (!dbChat) {
      // Create chat without responder assignment (responder_id = null)
      dbChat = await createChat(userId, null, 'crisis', {
        series_chat_id: chatId.toString(),
        reason: reason,
        severity: severity
      });
      console.log(`📝 Created unassigned crisis chat ${dbChat.id} (waiting for responder to accept)`);
    }
  }
  
  // Create risk alert without responder assignment (responder_id = null)
  // This allows responders to see and accept it when they become available
  await createRiskAlert(userId, null, dbChat?.id || null, severity, {
    reason: reason,
    content: content,
    chat_id: chatId || null,
    unassigned: true
  });
  
  console.log('✅ Crisis alert created - responders will see it and can accept');
  
  // Use AI to provide immediate support while waiting for responder
  console.log('🤖 Providing AI support while waiting for responder to accept...');
  console.log(`   User message: "${content}"`);
  console.log(`   Chat ID: ${chatId}`);
  
  try {
    const { generateAIResponse } = await import('./aiService.js');
    const { searchMentalHealthResources, formatResourcesForMessage } = await import('../utils/webResources.js');
    
    console.log('🔄 Generating AI response and fetching crisis resources in parallel...');
    // Generate AI response and fetch resources in parallel
    const crisisKeywords = ['crisis', 'suicide', 'mental health', 'support'];
    const [aiResponse, resources] = await Promise.all([
      generateAIResponse({
        userMessage: content || 'I need help',
        userPhone: userPhone,
        hasCrisisKeywords: true,
        sentiment: 'negative'
      }),
      searchMentalHealthResources(crisisKeywords)
    ]);
    console.log(`✅ AI response generated: "${aiResponse.substring(0, 100)}..."`);
    console.log(`✅ Found ${resources.length} resources`);
    
    // Format resources into message
    const resourcesMessage = formatResourcesForMessage(resources);
    
    // Combine AI response with resources
    const fullMessage = `${aiResponse}\n\n${resourcesMessage}`;
    
    console.log(`📤 Sending AI response with resources to user ${userPhone} via chat ${chatId}`);
    // Send AI-generated response with resources
    await sendMessageToUser(userPhone, fullMessage, chatId);
    console.log('✅ AI provided support and resources while waiting for responder');
  } catch (error) {
    console.error('❌ Error generating AI response or fetching resources:', sanitizeErrorMessage(error));
    console.error('   Full error:', error);
    // Fallback to basic crisis resources message
    const fallbackMessage = "I'm here for you. Crisis resources: 988 Suicide & Crisis Lifeline (call or text). We're working to connect you with someone.";
    console.log(`📤 Sending fallback message: "${fallbackMessage}"`);
    await sendMessageToUser(userPhone, fallbackMessage, chatId);
  }
  
  console.log('✅ Crisis alert created - responders can accept and continue in existing active chats if they have them');
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

  // Always create an alert for help requests - don't auto-assign
  // Responders will accept alerts and continue in existing active chats if they have them
  console.log('🆘 Creating help request alert for responder to accept...');
  const chatId = payload.chat_id;
  
  // Try to find or create a chat in the database (even without responder assignment)
  let dbChat = null;
  if (chatId) {
    dbChat = await getChatBySeriesId(chatId.toString());
    if (!dbChat) {
      // Create chat without responder assignment (responder_id = null)
      dbChat = await createChat(userId, null, 'peer', {
        series_chat_id: chatId.toString()
      });
      console.log(`📝 Created unassigned help chat ${dbChat.id} (waiting for responder to accept)`);
    }
  }
  
  // Create risk alert for help request (treated as medium severity)
  await createRiskAlert(userId, null, dbChat?.id || null, 'medium', {
    reason: 'help_request',
    content: message,
    chat_id: chatId || null,
    unassigned: true
  });
  
  console.log('✅ Help request alert created - responders will see it and can accept');
  
  // Use AI to provide immediate support while waiting for responder
  console.log('🤖 Providing AI support while waiting for responder to accept...');
  
  try {
    const { generateAIResponse } = await import('./aiService.js');
    const { searchMentalHealthResources, formatResourcesForMessage } = await import('../utils/webResources.js');
    
    // Extract keywords for resource search
    const keywords = extractKeywords(message || '');
    const searchKeywords = keywords.length > 0 ? keywords : ['support', 'help'];
    
    // Generate AI response and fetch resources in parallel
    const [aiResponse, resources] = await Promise.all([
      generateAIResponse({
        userMessage: message || 'I need help',
        userPhone: userPhone,
        sentiment: 'negative'
      }),
      searchMentalHealthResources(searchKeywords)
    ]);
    
    // Format resources into message
    const resourcesMessage = formatResourcesForMessage(resources);
    
    // Combine AI response with resources
    const fullMessage = `${aiResponse}\n\n${resourcesMessage}`;
    
    // Send AI-generated response with resources
    await sendMessageToUser(userPhone, fullMessage, chatId);
    console.log('✅ AI provided support and resources while waiting for responder');
  } catch (error) {
    console.error('❌ Error generating AI response or fetching resources:', sanitizeErrorMessage(error));
    // Fallback to basic message
    await sendMessageToUser(userPhone, "I'm here to help. How can I support you today?", chatId);
  }
  
  console.log('✅ Help request alert created - responders can accept and continue in existing active chats if they have them');
}

/**
 * Send message to user via Series API
 * Uses chatId if provided, otherwise finds or creates chat
 */
/**
 * Send message to user via Series API
 * Validates user exists in database before sending
 * @returns true if message was sent successfully, false otherwise
 */
async function sendMessageToUser(phone: string, message: string, chatId?: string | number): Promise<boolean> {
  if (!phone) {
    console.warn('⚠️  Cannot send message: no phone number provided');
    return false;
  }

  console.log(`\n📤 sendMessageToUser called:`);
  console.log(`   Phone: ${phone}`);
  console.log(`   Chat ID: ${chatId || 'not provided'}`);
  console.log(`   Message length: ${message.length} chars`);

  // ✅ VALIDATION: Only send to users registered in our database
  console.log(`   🔍 Verifying user exists in database...`);
  const { getUserByPhone, getActiveChatByUserId, getChatBySeriesId } = await import('../db/queries.js');
  const user = await getUserByPhone(phone);
  
  if (!user) {
    console.error(`❌ Cannot send message: phone number ${phone} not found in database`);
    console.error(`   Only users registered in our database can receive messages`);
    console.error(`   User must send a message first to be registered`);
    return false;
  }

  console.log(`✅ Verified user ${phone} exists in database (user_id: ${user.id}, anonymous_name: ${user.anonymous_name || 'N/A'})`);

  // ✅ CRITICAL: Check if human responder is active - if so, DO NOT send AI messages
  let activeChat = null;
  if (chatId) {
    // Check by series_chat_id first
    const seriesChatId = typeof chatId === 'string' ? chatId : chatId.toString();
    activeChat = await getChatBySeriesId(seriesChatId);
  }
  
  // If not found by series_chat_id, check for active chat by user_id
  if (!activeChat) {
    activeChat = await getActiveChatByUserId(user.id);
  }
  
  if (activeChat && activeChat.responder_id && activeChat.status !== 'ended' && activeChat.status !== 'archived') {
    console.log(`   🚫 BLOCKED: Human responder is active (responder_id: ${activeChat.responder_id}) - AI cannot send messages`);
    console.log(`   ℹ️  Message not sent. Responder will handle this conversation.`);
    return false; // Do not send message when human responder is active
  }
  
  if (activeChat) {
    console.log(`   ✅ No active human responder - AI can send message (responder_id: ${activeChat.responder_id || 'NULL'}, status: ${activeChat.status})`);
  }

  try {
    // If we have a chat ID from the incoming message, use it directly
    if (chatId) {
      const chatIdNum = typeof chatId === 'string' ? parseInt(chatId) : chatId;
      
      // Validate chat ID is a valid number
      if (isNaN(chatIdNum) || chatIdNum <= 0) {
        console.error(`❌ Invalid chat ID: ${chatId} (parsed as ${chatIdNum})`);
        return false;
      }
      
      console.log(`📤 Sending message via Series API:`);
      console.log(`   Chat ID: ${chatIdNum}`);
      console.log(`   User: ${phone}`);
      console.log(`   Message preview: "${message.substring(0, 80)}${message.length > 80 ? '...' : ''}"`);
      console.log(`   Message length: ${message.length} characters`);
      
      // Removed chat verification - just send directly to reduce latency
      await seriesClient.sendTextMessage(chatIdNum, message);
      
      console.log(`✅ SUCCESS: Message sent to chat ${chatIdNum} for user ${phone}`);
      return true;
    }

    // Otherwise, try to find existing chat
    console.log(`🔍 No chat_id provided, searching for existing chat for ${phone}`);
    let chat = await seriesClient.findChat(phone);
    
    if (!chat) {
      // Create new chat with message
      console.log(`📝 No existing chat found, creating new chat for ${phone}`);
      chat = await seriesClient.createChatWithMessage([phone], message);
      console.log(`✅ Created new chat ${chat.id} and sent message`);
      return true;
    } else {
      // Send message to existing chat
      console.log(`📤 Found existing chat ${chat.id}, sending message`);
      await seriesClient.sendTextMessage(chat.id, message);
      console.log(`✅ Sent message to existing chat ${chat.id}`);
      return true;
    }
  } catch (error: any) {
    // Sanitize error logging to prevent API key exposure
    const safeMessage = sanitizeErrorMessage(error);
    console.error(`❌ FAILED to send message to user ${phone}:`, safeMessage);
    if (error.response) {
      // Only log safe error data (no API keys or sensitive info)
      const safeData = error.response.data?.message || 'API request failed';
      console.error('   Series API Error:', {
        status: error.response.status,
        message: safeData
        // Don't log full response.data which might contain sensitive info
      });
    } else if (error.request) {
      console.error('   Network Error: No response received from Series API');
      console.error(`   Error: ${error.message}`);
    }
    // Don't throw - we don't want to crash the processor
    console.error('   Continuing processing despite send error');
    return false;
  }
}

// Analysis functions are now imported from ./analysis.js

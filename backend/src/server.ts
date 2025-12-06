import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, pool } from './db/index.js';
import { seriesClient } from './api/seriesClient.js';
import { startConsumer, stopConsumer } from './kafka/consumer.js';
import { processEvent } from './mcp/processor.js';
import { KafkaEvent, SeriesKafkaEvent, MessageReceivedEvent } from './kafka/types.js';
import { sanitizeErrorMessage } from './utils/sanitize.js';
import { 
  createOrGetUser, 
  getUserById, 
  getUserByPhone,
  getLast7Checkins,
  getPendingRiskAlerts,
  getRiskAlertById,
  updateRiskAlertStatus,
  getActiveChats,
  getAllActiveChats,
  getChatById,
  createChat,
  getUserChats,
  updateChatStatus,
  getAllResponders,
  getResponderById,
  createResponder,
  updateResponder,
  updateResponderAvailability,
  getJournalEntries,
  getUserStats,
  getSystemStats
} from './db/queries.js';
import { rateLimit, strictRateLimit } from './middleware/rateLimiter.js';
import { Server } from 'http';
import { startMCPWithClient } from './mcp/startMcpWithClient.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
let server: Server | null = null;

// CORS configuration - allow frontend to connect
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting for all API endpoints (10 requests per minute per IP)
app.use('/api', rateLimit(60000, 10));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Favicon route (silence browser requests)
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Health check endpoint (rate limited: 60 requests per minute)
app.get('/health', rateLimit(60000, 60), async (req, res) => {
  const health: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };

  // Test database
  try {
    await query('SELECT NOW()');
    health.database = 'connected';
  } catch (error) {
    health.database = 'disconnected';
    health.database_error = error instanceof Error ? error.message : 'Unknown error';
  }

  // Test Series API (just check if configured)
  if (process.env.SERIES_API_KEY) {
    health.series_api = 'configured';
  } else {
    health.series_api = 'not_configured';
  }

  // Test Kafka (just check if configured)
  if (process.env.KAFKA_BROKER && process.env.KAFKA_TOPIC) {
    health.kafka = 'configured';
  } else {
    health.kafka = 'not_configured';
  }

  res.json(health);
});

// API endpoint to send welcome message (strict rate limit: 10 requests per minute)
// Only sends welcome to NEW users, existing users continue from previous chat
app.post('/api/send-welcome', strictRateLimit(60000, 10), async (req, res) => {
  try {
    const { phone_number } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Validate phone number format (E.164)
    if (!phone_number.startsWith('+')) {
      return res.status(400).json({ error: 'Phone number must be in E.164 format (e.g., +1234567890)' });
    }

    console.log(`📱 Checking user status for ${phone_number}`);

    // Get or create user
    const user = await createOrGetUser(phone_number);

    // Check if user is already onboarded (existing user)
    if (user.onboarded && user.first_message_at) {
      console.log(`   ℹ️  User already exists and is onboarded - no welcome needed`);
      
      // Try to find existing chat
      let chat = await seriesClient.findChat(phone_number);
      if (chat) {
        return res.json({
          success: true,
          message: 'User already exists - continuing from previous chat',
          chat_id: chat.id,
          onboarded: true
        });
      }
      
      // If no chat found, create one but don't send welcome
      chat = await seriesClient.createChatWithMessage(
        [phone_number],
        "Hi! I'm here. How can I help you today?",
        'Emotional Support'
      );
      
      return res.json({
        success: true,
        message: 'Existing user - chat reconnected',
        chat_id: chat.id,
        onboarded: true
      });
    }

    // New user - generate AI-powered welcome message with instructions
    console.log(`   ✨ New user detected - generating AI welcome message`);
    
    let welcomeMessage: string;
    
    try {
      // Generate AI-powered welcome message using OpenAI
      const { generateWelcomeMessage } = await import('./mcp/aiService.js');
      welcomeMessage = await generateWelcomeMessage();
      console.log(`   ✅ AI-generated welcome message created`);
    } catch (aiError: any) {
      console.error('❌ Error generating AI welcome message:', sanitizeErrorMessage(aiError));
      // Fallback to template-based welcome
      welcomeMessage = `Welcome to Series Emotional Support!

Here's how it works:
• Send me an emoji to check in (😊 😐 😞 😰 🆘)
• Or just text me anything - I'm here to listen and support you
• Type "crisis" or "help" if you need immediate assistance
• Everything stays private and anonymous
• I use AI to provide personalized, empathetic responses

What's on your mind?`;
    }

    // Send message via Series API
    try {
      const chat = await seriesClient.createChatWithMessage(
        [phone_number],
        welcomeMessage,
        'Emotional Support'
      );

      console.log(`✅ Welcome message sent! Chat ID: ${chat.id}`);

      res.json({
        success: true,
        message: 'Welcome message sent successfully',
        chat_id: chat.id,
        phone_number: phone_number
      });
    } catch (apiError: any) {
      // Check if it's a DNS/connection error
      if (apiError.code === 'ENOTFOUND' || apiError.message?.includes('getaddrinfo')) {
        console.error('❌ Series API URL not reachable');
        return res.status(503).json({
          error: 'Series API service unavailable',
          message: 'The Series API endpoint is not reachable. Please check SERIES_API_BASE_URL configuration.'
          // Don't expose the actual URL
        });
      }
      
      // Other API errors - sanitize to prevent API key exposure
      const safeError = apiError.response?.data 
        ? { message: apiError.response.data.message || 'Failed to send message' }
        : { message: 'Failed to send welcome message' };
      
      console.error('❌ Series API error:', {
        status: apiError.response?.status,
        message: safeError.message
        // Don't log full response data which might contain sensitive info
      });
      
      res.status(500).json({
        error: 'Failed to send welcome message',
        details: safeError.message
      });
    }
  } catch (error: any) {
    // Sanitize error to prevent exposing sensitive info
    const safeMessage = sanitizeErrorMessage(error);
    
    console.error('❌ Error in send-welcome endpoint:', {
      message: safeMessage,
      // Don't log full error object which might contain sensitive data
    });
    
    res.status(500).json({
      error: 'Internal server error',
      details: safeMessage
    });
  }
});

// API endpoint to get user data by phone number
// NOTE: This endpoint masks phone numbers for privacy - only returns anonymous_name
app.get('/api/user/:phone', rateLimit(60000, 30), async (req, res) => {
  try {
    const { phone } = req.params;
    const user = await getUserByPhone(phone);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Generate anonymous name if missing
    if (!user.anonymous_name) {
      const { generateAnonymousName } = await import('./utils/anonymousNames.js');
      const anonymousName = generateAnonymousName(user.id);
      const { query } = await import('./db/index.js');
      await query('UPDATE users SET anonymous_name = $1 WHERE id = $2', [anonymousName, user.id]);
      user.anonymous_name = anonymousName;
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        anonymous_name: user.anonymous_name, // Return anonymous name instead of phone
        name: user.name,
        onboarded: user.onboarded,
        created_at: user.created_at,
        last_checkin_at: user.last_checkin_at
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching user:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: sanitizeErrorMessage(error)
    });
  }
});

// API endpoint to get user's check-ins
app.get('/api/user/:phone/checkins', rateLimit(60000, 30), async (req, res) => {
  try {
    const { phone } = req.params;
    const user = await getUserByPhone(phone);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const checkins = await getLast7Checkins(user.id);
    
    res.json({
      success: true,
      checkins: checkins.map(c => ({
        mood: c.mood,
        text: c.text,
        timestamp: c.timestamp
      }))
    });
  } catch (error: any) {
    console.error('❌ Error fetching check-ins:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: sanitizeErrorMessage(error)
    });
  }
});

// API endpoint to get pending risk alerts (for responder dashboard)
// Available responders can see:
//   1. Alerts assigned to them (responder_id matches)
//   2. Unassigned alerts (responder_id IS NULL) - so they can accept them
// Only available (is_available = true) responders can view alerts
// This ensures privacy - responders only see users they have helped or can help
app.get('/api/alerts/pending', rateLimit(60000, 10), async (req, res) => {
  try {
    const { responder_id } = req.query;
    
    if (!responder_id) {
      return res.status(400).json({ 
        error: 'responder_id is required',
        message: 'Only available responders can view alerts'
      });
    }
    
    // Handle default responder case - get or create a default responder
    let actualResponderId = responder_id as string;
    
    if (responder_id === 'default-responder' || responder_id === 'default') {
      // Try to find or create a default responder
      const allResponders = await getAllResponders();
      const defaultResponder = allResponders.find(r => r.name === 'Default Responder' || r.specialty === 'peer');
      
      if (defaultResponder) {
        actualResponderId = defaultResponder.id;
      } else {
        // Create a default responder
        const newResponder = await createResponder('Default Responder', undefined, undefined, 'peer');
        actualResponderId = newResponder.id;
        console.log(`✅ Created default responder for alerts: ${actualResponderId}`);
      }
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(actualResponderId)) {
      console.warn(`⚠️  Invalid responder ID format: ${responder_id}, returning empty alerts`);
      return res.json({
        success: true,
        alerts: []
      });
    }
    
    // Verify responder exists and is available
    const responder = await getResponderById(actualResponderId);
    if (!responder) {
      return res.status(404).json({ error: 'Responder not found' });
    }
    
    if (!responder.is_available) {
      return res.json({
        success: true,
        alerts: [],
        message: 'You must be available (online) to receive alerts. Please set your status to available.'
      });
    }
    
    // Show alerts assigned to this responder OR unassigned alerts (so they can accept them)
    const alerts = await getPendingRiskAlerts(actualResponderId);
    
    res.json({
      success: true,
      alerts: alerts.map(alert => ({
        id: alert.id,
        user_display_name: alert.user_display_name, // Anonymous name instead of phone
        user_id: alert.user_id, // For internal reference only
        severity: alert.severity,
        status: alert.status,
        context: alert.context,
        message_preview: alert.context?.message || alert.context?.message_preview || '',
        detected_keywords: alert.context?.keywords || alert.context?.detected_keywords || [],
        created_at: alert.created_at
      }))
    });
  } catch (error: any) {
    console.error('❌ Error fetching alerts:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: sanitizeErrorMessage(error)
    });
  }
});

// API endpoint to get responder's active chats
// Responders can ONLY see chats they are assigned to (responder_id matches)
app.get('/api/responder/:responderId/chats', rateLimit(60000, 10), async (req, res) => {
  try {
    const { responderId } = req.params;
    
    // Handle default responder case - get or create a default responder
    let actualResponderId = responderId;
    
    if (responderId === 'default-responder' || responderId === 'default') {
      // Try to find or create a default responder
      const allResponders = await getAllResponders();
      const defaultResponder = allResponders.find(r => r.name === 'Default Responder' || r.specialty === 'peer');
      
      if (defaultResponder) {
        actualResponderId = defaultResponder.id;
      } else {
        // Create a default responder
        const newResponder = await createResponder('Default Responder', undefined, undefined, 'peer');
        actualResponderId = newResponder.id;
        console.log(`✅ Created default responder: ${actualResponderId}`);
      }
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(actualResponderId)) {
      console.warn(`⚠️  Invalid responder ID format: ${responderId}, returning empty chats`);
      return res.json({
        success: true,
        chats: []
      });
    }
    
    // Responders can ONLY see chats assigned to them (responder_id matches)
    // This ensures privacy - responders only see users they have helped
    const chats = await getActiveChats(actualResponderId);
    console.log(`📊 Responder ${actualResponderId}: Found ${chats.length} assigned active chats`);
    
    res.json({
      success: true,
      chats: chats.map(chat => ({
        id: chat.id,
        user_display_name: chat.user_display_name, // Anonymous name instead of phone
        user_id: chat.user_id, // For internal reference only
        type: chat.type,
        status: chat.status,
        series_chat_id: chat.series_chat_id,
        created_at: chat.created_at,
        last_message: chat.last_message,
        last_message_at: chat.last_message_at
      }))
    });
  } catch (error: any) {
    console.error('❌ Error fetching responder chats:', error);
    // Return empty array on error instead of failing
    res.json({
      success: true,
      chats: []
    });
  }
});

// API endpoint to get all responders
app.get('/api/responders', rateLimit(60000, 30), async (req, res) => {
  try {
    const responders = await getAllResponders();
    
    res.json({
      success: true,
      responders: responders.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        is_available: r.is_available,
        specialty: r.specialty,
        last_active_at: r.last_active_at
      }))
    });
  } catch (error: any) {
    console.error('❌ Error fetching responders:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: sanitizeErrorMessage(error)
    });
  }
});

// API endpoint to update responder availability
app.put('/api/responder/:responderId/availability', rateLimit(60000, 20), async (req, res) => {
  try {
    const { responderId } = req.params;
    const { is_available } = req.body;
    
    if (typeof is_available !== 'boolean') {
      return res.status(400).json({ error: 'is_available must be a boolean' });
    }
    
    // Handle default responder case - get or create a default responder
    let actualResponderId = responderId;
    
    if (responderId === 'default-responder' || responderId === 'default') {
      // Try to find or create a default responder
      const allResponders = await getAllResponders();
      const defaultResponder = allResponders.find(r => r.name === 'Default Responder' || r.specialty === 'peer');
      
      if (defaultResponder) {
        actualResponderId = defaultResponder.id;
      } else {
        // Create a default responder
        const newResponder = await createResponder('Default Responder', undefined, undefined, 'peer');
        actualResponderId = newResponder.id;
        console.log(`✅ Created default responder for availability update: ${actualResponderId}`);
      }
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(actualResponderId)) {
      return res.status(400).json({ error: 'Invalid responder ID format' });
    }
    
    const responder = await updateResponderAvailability(actualResponderId, is_available);
    
    if (!responder) {
      return res.status(404).json({ error: 'Responder not found' });
    }
    
    console.log(`✅ Responder ${actualResponderId} availability updated to: ${is_available ? 'available' : 'offline'}`);
    
    res.json({
      success: true,
      responder: {
        id: responder.id,
        name: responder.name,
        is_available: responder.is_available,
        last_active_at: responder.last_active_at
      }
    });
  } catch (error: any) {
    console.error('❌ Error updating responder availability:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: sanitizeErrorMessage(error)
    });
  }
});

// Also support PATCH method for frontend compatibility
app.patch('/api/responder/:responderId/availability', rateLimit(60000, 20), async (req, res) => {
  try {
    const { responderId } = req.params;
    const { is_available } = req.body;
    
    if (typeof is_available !== 'boolean') {
      return res.status(400).json({ error: 'is_available must be a boolean' });
    }
    
    // Handle default responder case - get or create a default responder
    let actualResponderId = responderId;
    
    if (responderId === 'default-responder' || responderId === 'default') {
      // Try to find or create a default responder
      const allResponders = await getAllResponders();
      const defaultResponder = allResponders.find(r => r.name === 'Default Responder' || r.specialty === 'peer');
      
      if (defaultResponder) {
        actualResponderId = defaultResponder.id;
      } else {
        // Create a default responder
        const newResponder = await createResponder('Default Responder', undefined, undefined, 'peer');
        actualResponderId = newResponder.id;
        console.log(`✅ Created default responder for availability update: ${actualResponderId}`);
      }
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(actualResponderId)) {
      return res.status(400).json({ error: 'Invalid responder ID format' });
    }
    
    const responder = await updateResponderAvailability(actualResponderId, is_available);
    
    if (!responder) {
      return res.status(404).json({ error: 'Responder not found' });
    }
    
    console.log(`✅ Responder ${actualResponderId} availability updated to: ${is_available ? 'available' : 'offline'}`);
    
    res.json({
      success: true,
      responder: {
        id: responder.id,
        name: responder.name,
        is_available: responder.is_available,
        last_active_at: responder.last_active_at
      }
    });
  } catch (error: any) {
    console.error('❌ Error updating responder availability:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: sanitizeErrorMessage(error)
    });
  }
});

// Test endpoint to simulate incoming messages (without Kafka)
app.post('/api/test-message', strictRateLimit(60000, 10), async (req, res) => {
  try {
    const { phone_number, message_text, chat_id } = req.body;
    
    if (!phone_number || !message_text) {
      return res.status(400).json({ 
        error: 'phone_number and message_text are required' 
      });
    }

    // Validate phone number format
    if (!phone_number.startsWith('+')) {
      return res.status(400).json({ 
        error: 'Phone number must be in E.164 format (e.g., +1234567890)' 
      });
    }

    console.log(`🧪 Test: Simulating incoming message from ${phone_number}`);
    console.log(`   Message: "${message_text}"`);
    console.log(`   Chat ID: ${chat_id || 'will be generated'}`);

    // Create a mock Series API event (simulating what Kafka would send)
    const mockEvent: MessageReceivedEvent = {
      api_version: '1.0',
      created_at: new Date().toISOString(),
      event_id: `test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      event_type: 'message.received',
      data: {
        attachments: [],
        chat_handles: [
          {
            display_name: phone_number,
            identifier: phone_number,
            is_me: false // This is from the user, not us
          }
        ],
        chat_id: chat_id || '1700000', // Use provided chat_id or default
        from_phone: phone_number,
        id: `test-msg-${Date.now()}`,
        is_read: false,
        reaction_id: null,
        sent_at: new Date().toISOString(),
        service: 'iMessage',
        text: message_text
      }
    };

    // Process the event directly (bypassing Kafka)
    await processEvent(mockEvent);

    res.json({
      success: true,
      message: 'Test message processed successfully',
      event_id: mockEvent.event_id,
      phone_number: phone_number,
      chat_id: mockEvent.data.chat_id
    });
  } catch (error: any) {
    console.error('❌ Error processing test message:', error);
    res.status(500).json({
      error: 'Failed to process test message',
      details: sanitizeErrorMessage(error)
    });
  }
});

// API endpoint to get user's journal entries
app.get('/api/user/:phone/journal', rateLimit(60000, 30), async (req, res) => {
  try {
    const { phone } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const user = await getUserByPhone(phone);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const entries = await getJournalEntries(user.id, limit);
    res.json({ success: true, entries });
  } catch (error: any) {
    console.error('❌ Error fetching journal entries:', error);
    res.status(500).json({ error: 'Failed to fetch journal entries', details: error.message });
  }
});

// API endpoint to get user's chats
app.get('/api/user/:phone/chats', rateLimit(60000, 30), async (req, res) => {
  try {
    const { phone } = req.params;
    const user = await getUserByPhone(phone);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const chats = await getUserChats(user.id);
    res.json({ success: true, chats });
  } catch (error: any) {
    console.error('❌ Error fetching user chats:', error);
    res.status(500).json({ error: 'Failed to fetch user chats', details: error.message });
  }
});

// API endpoint to get chat details
app.get('/api/chat/:chatId', rateLimit(60000, 10), async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await getChatById(chatId, false); // Don't include phone numbers
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    // Get messages from Series API if series_chat_id exists
    let messages: any[] = [];
    if (chat.series_chat_id) {
      try {
        const seriesMessages = await seriesClient.getChatMessages(parseInt(chat.series_chat_id));
        messages = seriesMessages.map((msg: any) => ({
          id: msg.id,
          text: msg.text || '',
          sent_at: msg.sent_at,
          from_phone: msg.from_phone,
          is_read: msg.is_read,
          sender: msg.from_phone === process.env.SERIES_SENDER_NUMBER ? 'responder' : 'receiver'
        }));
      } catch (msgError: any) {
        console.warn('⚠️  Could not fetch messages from Series API:', sanitizeErrorMessage(msgError));
      }
    }
    
    // Remove user_phone if present, ensure only user_display_name is returned
    const { user_phone, ...safeChat } = chat;
    res.json({ 
      success: true, 
      chat: {
        ...safeChat,
        user_display_name: chat.user_display_name || 'Anonymous User',
        user_id: chat.user_id,
        messages: messages
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching chat:', error);
    res.status(500).json({ error: 'Failed to fetch chat', details: sanitizeErrorMessage(error) });
  }
});

// API endpoint to send message from responder
app.post('/api/chat/:chatId/message', rateLimit(60000, 30), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { message_text } = req.body;
    
    if (!message_text || !message_text.trim()) {
      return res.status(400).json({ error: 'message_text is required' });
    }
    
    const chat = await getChatById(chatId, false);
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    if (!chat.series_chat_id) {
      return res.status(400).json({ error: 'Chat does not have a Series chat ID' });
    }
    
    // Send message via Series API
    const sentMessage = await seriesClient.sendTextMessage(parseInt(chat.series_chat_id), message_text.trim());
    
    res.json({
      success: true,
      message: {
        id: sentMessage.id,
        text: sentMessage.text,
        sent_at: sentMessage.sent_at,
        sender: 'responder'
      }
    });
  } catch (error: any) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ 
      error: 'Failed to send message', 
      details: sanitizeErrorMessage(error) 
    });
  }
});

// API endpoint to update chat status
app.put('/api/chat/:chatId/status', rateLimit(60000, 20), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { status } = req.body;
    
    if (!status || !['active', 'ended', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Valid status is required (active, ended, archived)' });
    }
    
    const chat = await updateChatStatus(chatId, status);
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    res.json({ success: true, chat });
  } catch (error: any) {
    console.error('❌ Error updating chat status:', error);
    res.status(500).json({ error: 'Failed to update chat status', details: error.message });
  }
});

// API endpoint to get risk alert details
app.get('/api/alert/:alertId', rateLimit(60000, 30), async (req, res) => {
  try {
    const { alertId } = req.params;
    const alert = await getRiskAlertById(alertId);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    // Remove user_phone, only return user_display_name
    const { user_phone, ...safeAlert } = alert;
    res.json({ 
      success: true, 
      alert: {
        ...safeAlert,
        user_display_name: alert.user_display_name,
        user_id: alert.user_id
      }
    });
  } catch (error: any) {
    console.error('❌ Error fetching alert:', error);
    res.status(500).json({ error: 'Failed to fetch alert', details: error.message });
  }
});

// API endpoint to update risk alert status
app.put('/api/alert/:alertId/status', rateLimit(60000, 20), async (req, res) => {
  try {
    const { alertId } = req.params;
    const { status, responder_id } = req.body;
    
    if (!status || !['pending', 'acknowledged', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Valid status is required (pending, acknowledged, resolved, dismissed)' });
    }
    
    const alert = await updateRiskAlertStatus(alertId, status, responder_id);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    res.json({ success: true, alert });
  } catch (error: any) {
    console.error('❌ Error updating alert status:', error);
    res.status(500).json({ error: 'Failed to update alert status', details: sanitizeErrorMessage(error) });
  }
});

// API endpoint for responder to accept/claim a case
// Assigns the responder to an alert and creates/updates the chat
// Responders can ONLY accept cases if they are available (is_available = true)
// Responders can ONLY accept cases assigned to them or unassigned cases
app.post('/api/alert/:alertId/accept', rateLimit(60000, 10), async (req, res) => {
  try {
    const { alertId } = req.params;
    const { responder_id } = req.body;
    
    if (!responder_id) {
      return res.status(400).json({ error: 'responder_id is required' });
    }
    
    // Verify responder exists and is available
    const responder = await getResponderById(responder_id);
    if (!responder) {
      return res.status(404).json({ error: 'Responder not found' });
    }
    
    if (!responder.is_available) {
      return res.status(403).json({ 
        error: 'You must be available (online) to accept cases',
        message: 'Please set your status to available before accepting cases'
      });
    }
    
    // Get the alert
    const alert = await getRiskAlertById(alertId);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    // Check if alert is already assigned to another responder
    if (alert.responder_id && alert.responder_id !== responder_id) {
      return res.status(403).json({ 
        error: 'Alert is already assigned to another responder',
        assigned_to: alert.responder_id
      });
    }
    
    // Get user phone number
    const user = await getUserById(alert.user_id);
    if (!user || !user.phone) {
      return res.status(404).json({ error: 'User not found or phone number missing' });
    }
    
    // Update alert to assign responder
    await updateRiskAlertStatus(alertId, 'acknowledged', responder_id);
    
    // Check if chat already exists for this alert
    let chat = alert.chat_id ? await getChatById(alert.chat_id, false) : null;
    
    if (!chat) {
      // Create new chat via Series API
      const seriesChat = await seriesClient.createChatWithMessage(
        [user.phone],
        "I'm connecting you with a trained responder right now. You're not alone.",
        'Crisis Support'
      );
      
      // Create chat in database
      chat = await createChat(alert.user_id, responder_id, 'crisis', {
        series_chat_id: seriesChat.id.toString(),
        reason: alert.context?.reason || 'Crisis support',
        severity: alert.severity
      });
      
      console.log(`✅ Responder ${responder_id} (available) accepted alert ${alertId}, chat created: ${chat.id}`);
    } else {
      // Update existing chat to assign responder
      await query(
        'UPDATE chats SET responder_id = $1 WHERE id = $2',
        [responder_id, chat.id]
      );
      console.log(`✅ Responder ${responder_id} (available) accepted alert ${alertId}, assigned to existing chat: ${chat.id}`);
    }
    
    // Get updated alert
    const updatedAlert = await getRiskAlertById(alertId);
    
    res.json({
      success: true,
      message: 'Case accepted successfully',
      alert: updatedAlert,
      chat: {
        id: chat.id,
        series_chat_id: chat.series_chat_id,
        type: chat.type,
        status: chat.status
      }
    });
  } catch (error: any) {
    console.error('❌ Error accepting alert:', error);
    res.status(500).json({ 
      error: 'Failed to accept alert', 
      details: sanitizeErrorMessage(error) 
    });
  }
});

// API endpoint to create responder
app.post('/api/responders', rateLimit(60000, 10), async (req, res) => {
  try {
    const { name, email, phone, specialty } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    const responder = await createResponder(
      name,
      email,
      phone,
      specialty || 'peer'
    );
    
    res.json({ success: true, responder });
  } catch (error: any) {
    console.error('❌ Error creating responder:', error);
    res.status(500).json({ error: 'Failed to create responder', details: error.message });
  }
});

// API endpoint to get responder details
app.get('/api/responder/:responderId', rateLimit(60000, 30), async (req, res) => {
  try {
    const { responderId } = req.params;
    const responder = await getResponderById(responderId);
    
    if (!responder) {
      return res.status(404).json({ error: 'Responder not found' });
    }
    
    res.json({ success: true, responder });
  } catch (error: any) {
    console.error('❌ Error fetching responder:', error);
    res.status(500).json({ error: 'Failed to fetch responder', details: error.message });
  }
});

// API endpoint to update responder details
app.put('/api/responder/:responderId', rateLimit(60000, 20), async (req, res) => {
  try {
    const { responderId } = req.params;
    const { name, email, phone, specialty } = req.body;
    
    const responder = await updateResponder(responderId, {
      name,
      email,
      phone,
      specialty
    });
    
    if (!responder) {
      return res.status(404).json({ error: 'Responder not found' });
    }
    
    res.json({ success: true, responder });
  } catch (error: any) {
    console.error('❌ Error updating responder:', error);
    res.status(500).json({ error: 'Failed to update responder', details: error.message });
  }
});

// API endpoint to get user statistics
app.get('/api/user/:phone/stats', rateLimit(60000, 30), async (req, res) => {
  try {
    const { phone } = req.params;
    const user = await getUserByPhone(phone);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const stats = await getUserStats(user.id);
    res.json({ success: true, stats });
  } catch (error: any) {
    console.error('❌ Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats', details: error.message });
  }
});

// API endpoint to get system statistics
app.get('/api/stats', rateLimit(60000, 30), async (req, res) => {
  try {
    const stats = await getSystemStats();
    res.json({ success: true, stats });
  } catch (error: any) {
    console.error('❌ Error fetching system stats:', error);
    res.status(500).json({ error: 'Failed to fetch system stats', details: error.message });
  }
});

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
  
  try {
    // Close Express server
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => {
          console.log('✅ Express server closed');
          resolve();
        });
      });
    }
    
    // Stop Kafka consumer
    await stopConsumer();
    
    // Disconnect MCP client if it exists
    try {
      const { getMCPClient } = await import('./mcp/startMcpWithClient.js');
      const mcpClient = getMCPClient();
      if (mcpClient) {
        await mcpClient.disconnect();
        console.log('✅ MCP client disconnected');
      }
    } catch (error: any) {
      console.warn('⚠️  Error disconnecting MCP client:', error.message);
    }
    
    // Close database pool
    await pool.end();
    console.log('✅ Database pool closed');
    
    // Cleanup rate limiters
    const { cleanupRateLimiter } = await import('./middleware/rateLimiter.js');
    cleanupRateLimiter();
    const { cleanupChatRateLimiter } = await import('./middleware/chatRateLimiter.js');
    cleanupChatRateLimiter();
    console.log('✅ Rate limiters cleaned up');
    
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Start server
async function start() {
  try {
    // Start Express server
    server = app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`✅ Health check: http://localhost:${PORT}/health`);
      console.log(`✅ Web form: http://localhost:${PORT}`);
    });

    // Start Kafka consumer ONLY if explicitly enabled via environment variable
    // Set ENABLE_KAFKA=true in .env to enable Kafka consumer
    if (process.env.ENABLE_KAFKA === 'true' && process.env.KAFKA_BROKER && process.env.KAFKA_TOPIC) {
      try {
        console.log('🔄 Starting Kafka consumer...');
        await startConsumer(async (event: KafkaEvent | SeriesKafkaEvent) => {
          await processEvent(event);
        });
        console.log('✅ Kafka consumer started successfully');
        console.log('📡 Listening for Series API events (message.received, etc.)');
      } catch (error) {
        console.error('⚠️  Kafka consumer failed to start:', error);
        console.log('   Server will continue without Kafka consumer');
        console.log('   Fix credentials and restart to enable Kafka processing');
      }
    } else {
      if (process.env.ENABLE_KAFKA !== 'true') {
        console.log('ℹ️  Kafka consumer disabled (set ENABLE_KAFKA=true in .env to enable)');
      } else {
        console.log('⚠️  Kafka not configured - skipping consumer startup');
      }
    }

    // Start MCP server with client
    // Wrap in try-catch to prevent MCP errors from crashing the main server
    try {
      await startMCPWithClient();
      console.log('✅ Server startup complete - all services initialized');
    } catch (mcpError: any) {
      console.error('⚠️  MCP server/client failed to start:', mcpError.message);
      console.error('   Server will continue without MCP client');
      console.error('   Stack:', mcpError.stack?.substring(0, 300));
      // Don't exit - allow server to continue without MCP
    }

  } catch (error: any) {
    console.error('❌ Failed to start server:', error);
    console.error('   Error details:', error.message);
    if (error.stack) {
      console.error('   Stack:', error.stack.substring(0, 500));
    }
    process.exit(1);
  }
}

start();

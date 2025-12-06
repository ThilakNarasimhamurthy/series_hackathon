import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, pool } from './db/index.js';
import { seriesClient } from './api/seriesClient.js';
import { startConsumer, stopConsumer } from './kafka/consumer.js';
import { processEvent } from './mcp/processor.js';
import { KafkaEvent, SeriesKafkaEvent } from './kafka/types.js';
import { 
  createOrGetUser, 
  getUserById, 
  getUserByPhone,
  getLast7Checkins,
  getPendingRiskAlerts,
  getActiveChats,
  getAllResponders,
  updateResponderAvailability
} from './db/queries.js';
import { rateLimit, strictRateLimit } from './middleware/rateLimiter.js';
import { Server } from 'http';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
let server: Server | null = null;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting for all API endpoints (100 requests per minute per IP)
app.use('/api', rateLimit(60000, 100));

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

    console.log(`📱 Sending welcome message to ${phone_number}`);

    // Create or get user
    const user = await createOrGetUser(phone_number);

    // Welcome message
    const welcomeMessage = `Hey there! 👋 Welcome to Series Emotional Support.

I'm here whenever you need someone to talk to - day or night. Think of me as a friend who's always ready to listen.

Here's how we can connect:

😊 Send me an emoji to check in:
   😊 = Doing great
   😐 = Just okay
   😞 = Having a tough time
   😰 = Feeling anxious
   🆘 = Really need someone right now

💬 Or just text me anything - your thoughts, what's on your mind, how your day went. I'm listening.

🆘 If things feel really overwhelming, just type "crisis" and I'll get you connected with someone who can help right away.

Everything we talk about stays between us - completely private and anonymous.

So... how are you doing today?`;

    // Send message via Series API
    try {
      const chat = await seriesClient.createChatWithMessage(
        [phone_number],
        welcomeMessage,
        'Mental Health Support'
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
    const safeMessage = error.message && !error.message.includes('API') && !error.message.includes('key')
      ? error.message
      : 'Internal server error';
    
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
app.get('/api/user/:phone', rateLimit(60000, 30), async (req, res) => {
  try {
    const { phone } = req.params;
    const user = await getUserByPhone(phone);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
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
      details: error.message
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
      details: error.message
    });
  }
});

// API endpoint to get pending risk alerts (for responder dashboard)
app.get('/api/alerts/pending', rateLimit(60000, 30), async (req, res) => {
  try {
    const { responder_id } = req.query;
    const alerts = await getPendingRiskAlerts(responder_id as string | undefined);
    
    res.json({
      success: true,
      alerts: alerts.map(alert => ({
        id: alert.id,
        user_phone: alert.user_phone,
        severity: alert.severity,
        status: alert.status,
        context: alert.context,
        created_at: alert.created_at
      }))
    });
  } catch (error: any) {
    console.error('❌ Error fetching alerts:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// API endpoint to get responder's active chats
app.get('/api/responder/:responderId/chats', rateLimit(60000, 30), async (req, res) => {
  try {
    const { responderId } = req.params;
    const chats = await getActiveChats(responderId);
    
    res.json({
      success: true,
      chats: chats.map(chat => ({
        id: chat.id,
        user_phone: chat.user_phone,
        type: chat.type,
        status: chat.status,
        series_chat_id: chat.series_chat_id,
        created_at: chat.created_at
      }))
    });
  } catch (error: any) {
    console.error('❌ Error fetching responder chats:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
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
      details: error.message
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
    
    const responder = await updateResponderAvailability(responderId, is_available);
    
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
      details: error.message
    });
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

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();

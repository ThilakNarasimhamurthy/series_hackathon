/**
 * Per-chat rate limiting to prevent API flooding
 */

interface ChatRateLimitStore {
  [chatId: string]: {
    lastMessageTime: number;
    messageCount: number;
    resetTime: number;
  };
}

const chatStore: ChatRateLimitStore = {};

// Cleanup old entries every 5 minutes
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupInterval) return; // Already started
  
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    Object.keys(chatStore).forEach(chatId => {
      if (chatStore[chatId].resetTime < now) {
        delete chatStore[chatId];
      }
    });
  }, 5 * 60 * 1000); // Clean up every 5 minutes
}

function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// Start cleanup on module load
startCleanup();

// Cleanup on process exit
process.on('SIGTERM', stopCleanup);
process.on('SIGINT', stopCleanup);

/**
 * Check if a chat has exceeded rate limits
 * Rate limit: 1 message per 30 seconds (ensures Series API is called only after 30 seconds)
 * @param chatId Chat ID to check
 * @returns true if within limits, false if rate limit exceeded
 */
export function checkChatRateLimit(chatId: string): boolean {
  const now = Date.now();
  const MIN_INTERVAL_MS = 30000; // 30 seconds - ensures Series API calls are spaced out
  
  if (!chatStore[chatId]) {
    chatStore[chatId] = {
      lastMessageTime: now,
      messageCount: 1,
      resetTime: now + MIN_INTERVAL_MS,
    };
    return true;
  }
  
  const chat = chatStore[chatId];
  
  // Check if 30 seconds have passed since last message
  const timeSinceLastMessage = now - chat.lastMessageTime;
  
  if (timeSinceLastMessage < MIN_INTERVAL_MS) {
    const secondsRemaining = Math.ceil((MIN_INTERVAL_MS - timeSinceLastMessage) / 1000);
    console.log(`⚠️  Rate limit: Series API can only be called once per 30 seconds for chat ${chatId}. Please wait ${secondsRemaining} more second(s)`);
    return false;
  }
  
  // Update last message time
  chat.lastMessageTime = now;
  chat.messageCount = 1;
  chat.resetTime = now + MIN_INTERVAL_MS;
  return true;
}

/**
 * Export cleanup function for graceful shutdown
 */
export function cleanupChatRateLimiter() {
  stopCleanup();
}


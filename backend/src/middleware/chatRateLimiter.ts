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
 * @param chatId Chat ID to check
 * @param maxPerMinute Maximum messages per minute (default: 5)
 * @param minIntervalMs Minimum interval between messages in milliseconds (default: 2000)
 * @returns true if within limits, false if rate limit exceeded
 */
export function checkChatRateLimit(chatId: string, maxPerMinute: number = 5, minIntervalMs: number = 2000): boolean {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  
  if (!chatStore[chatId]) {
    chatStore[chatId] = {
      lastMessageTime: now,
      messageCount: 1,
      resetTime: now + windowMs,
    };
    return true;
  }
  
  const chat = chatStore[chatId];
  
  // Reset if window expired
  if (now > chat.resetTime) {
    chat.messageCount = 1;
    chat.lastMessageTime = now;
    chat.resetTime = now + windowMs;
    return true;
  }
  
  // Check rate limit
  if (chat.messageCount >= maxPerMinute) {
    console.log(`⚠️  Rate limit exceeded for chat ${chatId}: ${chat.messageCount}/${maxPerMinute} per minute`);
    return false;
  }
  
  // Minimum interval between messages
  if (now - chat.lastMessageTime < minIntervalMs) {
    const timeSinceLastMessage = now - chat.lastMessageTime;
    console.log(`⚠️  Too soon between messages for chat ${chatId} (${timeSinceLastMessage}ms < ${minIntervalMs}ms)`);
    return false;
  }
  
  chat.messageCount++;
  chat.lastMessageTime = now;
  return true;
}

/**
 * Export cleanup function for graceful shutdown
 */
export function cleanupChatRateLimiter() {
  stopCleanup();
}


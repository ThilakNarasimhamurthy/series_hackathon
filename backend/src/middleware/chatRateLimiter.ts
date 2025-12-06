/**
 * Per-chat rate limiting to prevent API flooding
 * Messages are queued and processed after rate limit expires
 */

interface ChatRateLimitStore {
  [chatId: string]: {
    lastMessageTime: number;
    messageCount: number;
    resetTime: number;
    processingQueue: boolean;
  };
}

interface QueuedMessage {
  event: any;
  timestamp: number;
  retryCount: number;
}

const chatStore: ChatRateLimitStore = {};
const messageQueue: Map<string, QueuedMessage[]> = new Map(); // chatId -> messages[]

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

// NOTE: Don't register SIGTERM/SIGINT handlers here
// The main server's gracefulShutdown() calls cleanupChatRateLimiter()
// Registering handlers here causes duplicate shutdown sequences

/**
 * Check if a chat has exceeded rate limits (without updating the timestamp)
 * Rate limit: 1 message per 30 seconds (ensures Series API is called only after 30 seconds)
 * @param chatId Chat ID to check
 * @param updateTimestamp If true, updates the timestamp when canProcess is true
 * @returns { canProcess: boolean, waitTimeMs: number } - whether message can be processed now and how long to wait
 */
export function checkChatRateLimit(chatId: string, updateTimestamp: boolean = true): { canProcess: boolean; waitTimeMs: number } {
  const now = Date.now();
  const MIN_INTERVAL_MS = 30000; // 30 seconds - ensures Series API calls are spaced out
  
  if (!chatStore[chatId]) {
    if (updateTimestamp) {
      chatStore[chatId] = {
        lastMessageTime: now,
        messageCount: 1,
        resetTime: now + MIN_INTERVAL_MS,
        processingQueue: false,
      };
    }
    return { canProcess: true, waitTimeMs: 0 };
  }
  
  const chat = chatStore[chatId];
  
  // Check if 30 seconds have passed since last message
  const timeSinceLastMessage = now - chat.lastMessageTime;
  
  if (timeSinceLastMessage < MIN_INTERVAL_MS) {
    const waitTimeMs = MIN_INTERVAL_MS - timeSinceLastMessage;
    const secondsRemaining = Math.ceil(waitTimeMs / 1000);
    console.log(`⚠️  Rate limit: Series API can only be called once per 30 seconds for chat ${chatId}. Will process after ${secondsRemaining} second(s)`);
    return { canProcess: false, waitTimeMs };
  }
  
  // Update last message time only if requested
  if (updateTimestamp) {
    chat.lastMessageTime = now;
    chat.messageCount = 1;
    chat.resetTime = now + MIN_INTERVAL_MS;
  }
  return { canProcess: true, waitTimeMs: 0 };
}

/**
 * Queue a message to be processed after rate limit expires
 * @param chatId Chat ID
 * @param event Message event to queue
 */
export function queueMessage(chatId: string, event: any): void {
  if (!messageQueue.has(chatId)) {
    messageQueue.set(chatId, []);
  }
  
  const queue = messageQueue.get(chatId)!;
  queue.push({
    event,
    timestamp: Date.now(),
    retryCount: 0,
  });
  
  console.log(`📥 Queued message for chat ${chatId} (queue size: ${queue.length})`);
  
  // Always schedule queue processing (will create chat entry if needed)
  scheduleQueueProcessing(chatId);
}

/**
 * Schedule processing of queued messages for a chat
 */
function scheduleQueueProcessing(chatId: string): void {
  // Ensure chat exists in store
  if (!chatStore[chatId]) {
    const now = Date.now();
    chatStore[chatId] = {
      lastMessageTime: 0, // Will be set when processing
      messageCount: 0,
      resetTime: now,
      processingQueue: false,
    };
  }
  
  const chat = chatStore[chatId];
  if (chat.processingQueue) return; // Already processing
  
  const queue = messageQueue.get(chatId);
  if (!queue || queue.length === 0) return;
  
  // Check rate limit without updating timestamp (we'll update when processing)
  const checkRateLimit = checkChatRateLimit(chatId, false);
  
  if (checkRateLimit.canProcess) {
    // Process immediately
    processNextQueuedMessage(chatId);
  } else {
    // Schedule for later
    chat.processingQueue = true;
    setTimeout(() => {
      processNextQueuedMessage(chatId);
    }, checkRateLimit.waitTimeMs);
  }
}

/**
 * Process the next queued message for a chat
 */
async function processNextQueuedMessage(chatId: string): Promise<void> {
  const chat = chatStore[chatId];
  if (!chat) return;
  
  const queue = messageQueue.get(chatId);
  if (!queue || queue.length === 0) {
    chat.processingQueue = false;
    return;
  }
  
  // Check rate limit without updating timestamp yet
  const checkRateLimit = checkChatRateLimit(chatId, false);
  
  if (!checkRateLimit.canProcess) {
    // Still rate limited, reschedule
    chat.processingQueue = true;
    setTimeout(() => {
      processNextQueuedMessage(chatId);
    }, checkRateLimit.waitTimeMs);
    return;
  }
  
  // Process the next message
  const queuedMessage = queue.shift()!;
  chat.processingQueue = true;
  
  console.log(`🔄 Processing queued message for chat ${chatId} (${queue.length} remaining in queue)`);
  
  // Import processor dynamically to avoid circular dependencies
  const { processEvent } = await import('../mcp/processor.js');
  
  try {
    // Mark rate limit as used before processing (update timestamp)
    const now = Date.now();
    chat.lastMessageTime = now;
    chat.resetTime = now + 30000;
    
    // Process the event
    await processEvent(queuedMessage.event);
    
    console.log(`✅ Processed queued message for chat ${chatId}`);
  } catch (error) {
    console.error(`❌ Error processing queued message for chat ${chatId}:`, error);
    // Optionally retry (with max retry limit)
    if (queuedMessage.retryCount < 3) {
      queuedMessage.retryCount++;
      queue.push(queuedMessage);
      console.log(`🔄 Re-queued message (retry ${queuedMessage.retryCount}/3)`);
    }
  }
  
  // Process next message in queue
  if (queue.length > 0) {
    scheduleQueueProcessing(chatId);
  } else {
    chat.processingQueue = false;
  }
}

/**
 * Get queue status for a chat
 */
export function getQueueStatus(chatId: string): { queueLength: number; nextProcessTime?: number } {
  const queue = messageQueue.get(chatId);
  const chat = chatStore[chatId];
  
  if (!queue || queue.length === 0) {
    return { queueLength: 0 };
  }
  
  const nextProcessTime = chat ? chat.resetTime : undefined;
  return {
    queueLength: queue.length,
    nextProcessTime,
  };
}

/**
 * Export cleanup function for graceful shutdown
 */
export function cleanupChatRateLimiter() {
  stopCleanup();
  // Clear message queues
  messageQueue.clear();
}


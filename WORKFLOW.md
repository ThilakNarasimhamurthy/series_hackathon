# Complete Workflow Documentation

## 📱 Regular User Flow (iMessage)

### 1. **Initial Setup / Onboarding**

**Entry Point:** User visits landing page (`http://localhost:3001`)

**Step 1: User Enters Phone Number**
- User enters phone number in the callback form
- Frontend calls: `POST /api/send-welcome` with `{ phone_number: "+1234567890" }`

**Step 2: Backend Processes Welcome**
- Backend checks if user exists in database
- **New User:**
  - Creates user record with anonymous name
  - Sends welcome message: "Welcome to Series Emotional Support"
  - Creates chat session in database
  - User receives message via iMessage
  
- **Existing User:**
  - Finds existing chat or creates new one
  - Sends: "Hi! I'm here. How can I help you today?"
  - No welcome message (continues from previous chat)

**Step 3: Onboarding Message (After First Response)**
- When user sends first message, system detects new user
- After AI responds, sends onboarding explanation:
  ```
  Here's how this works:
  • Send me an emoji to check in (😊 😐 😞 😰 🆘)
  • Or just text me anything - I'm here to listen
  • Type "crisis" if you need immediate help
  • Everything stays private and anonymous
  
  What's on your mind?
  ```
- Marks user as `onboarded = true`

---

### 2. **Message Processing Flow**

**Trigger:** User sends iMessage → Series API → Kafka → Backend Processor

**Step 1: Message Received via Kafka**
- Series API sends `message.received` event to Kafka topic
- Backend Kafka consumer receives event (if `ENABLE_KAFKA=true`)
- Event contains: `text`, `from_phone`, `chat_id`, `chat_handles`

**Step 2: Message Deduplication & Filtering**
- Checks if message already processed (prevents duplicates)
- Checks rate limit: 1 message per 30 seconds per chat
- Filters out bot's own messages (checks `is_me` flag and sender number)
- Filters out known bot message patterns

**Step 3: Message Type Detection**

The system analyzes the message and routes to appropriate handler:

#### **A. Mood Check-in (Emoji Detected)**
- **Emojis:** 😊 😄 🙂 (happy), 😐 😕 (neutral), 😞 😢 (sad), 😰 🆘 (crisis)
- **Process:**
  1. Stores mood check-in in database
  2. Analyzes mood trend (last 7 check-ins)
  3. Generates AI recommendation based on mood + trend
  4. Sends personalized response via Series API
  5. If declining trend detected → Creates risk alert
  6. Sends onboarding message if new user

#### **B. Crisis Keywords Detected**
- **Keywords:** "suicide", "kill myself", "end it", "want to die", etc.
- **Process:**
  1. Immediately creates HIGH severity risk alert
  2. Finds available responder (crisis specialist preferred)
  3. Sends immediate support message with 988 resources
  4. Creates chat session with responder (if available)
  5. Alert appears in responder dashboard

#### **C. Help Request Keywords**
- **Keywords:** "help", "support", "talk", "someone to talk to"
- **Process:**
  1. Finds available peer responder
  2. Creates chat session with responder
  3. Sends: "I'm connecting you with a peer supporter."
  4. If no responder available: "I'm here to help. How can I support you today?"

#### **D. General Message (Text)**
- **Process:**
  1. Analyzes sentiment (positive/negative/neutral)
  2. Extracts keywords
  3. Checks for crisis keywords
  4. Gets user context (recent moods, journal entries)
  5. Generates AI response using OpenAI (or fallback templates)
  6. Sends empathetic, contextual response
  7. Stores as journal entry if substantial content

**Step 4: Response Sent**
- All responses sent via Series API to user's iMessage
- Messages include chat_id for proper threading
- Rate limited to prevent API flooding

---

### 3. **Ongoing Conversation**

**Features:**
- **Message History:** Stored in Series API, fetched when responder views chat
- **Context Awareness:** AI uses recent moods, journal entries, sentiment trends
- **Rate Limiting:** 1 message per 30 seconds to prevent spam
- **Auto-Refresh:** Responder dashboard refreshes every 10-30 seconds

---

## 👥 Responder Flow (Dashboard)

### 1. **Dashboard Access**

**Entry Point:** `http://localhost:3001/dashboard`

**Initial Load:**
- Frontend fetches:
  - `GET /api/alerts/pending` - Pending crisis alerts
  - `GET /api/responder/:responderId/chats` - Active chats
- Auto-refreshes every 30 seconds

---

### 2. **Alert Management**

**Step 1: Alert Appears**
- Crisis detected → Risk alert created in database
- Alert appears in "Incoming Triage" section
- Shows: Anonymous user name, severity, message preview, timestamp

**Step 2: Responder Accepts Alert**
- Responder clicks "Accept Case"
- Frontend calls: `PATCH /api/alert/:alertId` with `{ status: 'accepted', responder_id: '...' }`
- Alert removed from pending list
- Chat session created/updated with responder assignment
- Chat appears in "Active Sessions"

---

### 3. **Chat Management**

**Step 1: Select Chat**
- Responder clicks on chat from sidebar
- Frontend calls: `GET /api/chat/:chatId`
- Backend fetches:
  - Chat details from database
  - Messages from Series API (using `series_chat_id`)
  - User context (anonymous name, type, status)

**Step 2: View Messages**
- Messages displayed in chronological order
- Shows sender (responder vs. user)
- Timestamps formatted
- Crisis chats highlighted with red border

**Step 3: Send Message**
- Responder types message in textarea
- Frontend calls: `POST /api/chat/:chatId/message` with `{ message_text: "..." }`
- Backend:
  1. Validates chat exists
  2. Gets `series_chat_id` from database
  3. Sends message via Series API
  4. Returns sent message data
- Message appears in chat immediately
- User receives message via iMessage

**Step 4: End Session**
- Responder clicks "End Session"
- Frontend calls: `PUT /api/chat/:chatId/status` with `{ status: 'ended' }`
- Chat status updated in database
- Chat removed from active list

---

### 4. **Context Sidebar**

**Shows:**
- **Mood Trend Chart:** 7-day mood history (when check-ins available)
- **Recent Check-ins:** Last 3 mood check-ins with timestamps
- **Journal Entries:** Recent journal entries with sentiment

**Data Sources:**
- Fetched from chat context
- Ready for check-ins/journal endpoints (when implemented)

---

## 🔄 Complete End-to-End Example

### Scenario: User in Crisis

**1. User Flow:**
```
User sends: "I don't want to be here anymore"
    ↓
Kafka receives message.received event
    ↓
Backend detects crisis keywords
    ↓
Creates HIGH severity risk alert
    ↓
Sends immediate response: "I'm here for you. Crisis resources: 988..."
    ↓
Finds available responder
    ↓
Creates chat session with responder
```

**2. Responder Flow:**
```
Alert appears in dashboard
    ↓
Responder clicks "Accept Case"
    ↓
Alert status → 'accepted'
    ↓
Chat appears in Active Sessions
    ↓
Responder opens chat
    ↓
Views message history from Series API
    ↓
Responder sends: "I'm here. Can you tell me what's happening?"
    ↓
Message sent via Series API → User receives via iMessage
    ↓
User responds: "Everything feels hopeless"
    ↓
Message appears in responder dashboard (auto-refresh)
    ↓
Conversation continues...
```

---

## 🔐 Privacy & Security Features

### **Anonymous Names**
- Users identified by anonymous names (e.g., "Brave Friend", "Calm Listener")
- Phone numbers never exposed to responders
- Consistent names per user (generated from user ID)

### **Data Protection**
- API keys sanitized in logs
- Error messages don't expose sensitive data
- Rate limiting prevents abuse

---

## 📊 Database Flow

### **User Creation:**
```
User sends first message
    ↓
createOrGetUser(phone)
    ↓
Generates anonymous_name
    ↓
Stores: id, phone, anonymous_name, onboarded=false
```

### **Chat Creation:**
```
Message received
    ↓
getChatBySeriesId(chat_id)
    ↓
If not exists: createChat(user_id, responder_id, type, {series_chat_id})
    ↓
Stores: id, user_id, responder_id, series_chat_id, type, status
```

### **Alert Creation:**
```
Crisis detected OR declining mood trend
    ↓
createRiskAlert(user_id, responder_id, chat_id, severity, context)
    ↓
Stores: id, user_id, responder_id, severity, status='pending', context
```

---

## 🚀 Key Features

### **For Regular Users:**
- ✅ Simple onboarding (just enter phone number)
- ✅ Multiple interaction types (emoji check-ins, text, crisis)
- ✅ AI-powered empathetic responses
- ✅ Anonymous and private
- ✅ Crisis detection and escalation
- ✅ Rate limiting (prevents spam)

### **For Responders:**
- ✅ Real-time alert notifications
- ✅ Chat interface with message history
- ✅ Send/receive messages via dashboard
- ✅ User context (mood trends, check-ins)
- ✅ Anonymous user names (privacy)
- ✅ Auto-refresh (stays up-to-date)

---

## 🔧 Technical Details

### **Rate Limits:**
- **Chat Messages:** 1 per 30 seconds (prevents Series API flooding)
- **API Endpoints:** 30-100 requests per minute (varies by endpoint)
- **Welcome Messages:** 10 per minute (strict limit)

### **Message Deduplication:**
- Tracks processed `event_id`s
- Prevents duplicate processing
- TTL: 1 hour

### **Auto-Refresh:**
- **Chat Messages:** Every 10 seconds
- **Alerts/Chats List:** Every 30 seconds

### **Error Handling:**
- Graceful fallbacks for all operations
- Sanitized error messages
- Continues operation even if one component fails

---

## 📝 Notes

- **Kafka:** Currently disabled (`ENABLE_KAFKA=false`). Enable to process real-time Series API events
- **MCP Server:** Running and connected, provides AI tools and backend capabilities
- **OpenAI:** Used for generating empathetic responses (fallback templates if not configured)
- **Series API:** All iMessage communication goes through Series API


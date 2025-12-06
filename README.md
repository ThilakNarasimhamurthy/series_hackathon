# 🌱 Mental Health Support Platform

A comprehensive mental health support system that provides 24/7 AI-powered assistance with seamless human responder escalation. Built for the Series Hackathon, this platform enables users to receive instant emotional support via iMessage, with intelligent crisis detection and human responder handoff capabilities.

## ✨ Key Features

### For Users
- **24/7 AI-Powered Support**: Instant, empathetic responses via OpenAI integration
- **Anonymous & Private**: No accounts required, fully encrypted communication
- **Mood Tracking**: Check-in with emojis (😊 😐 😞 😰 🆘) to track emotional state
- **Journal Entries**: Share thoughts and feelings, get contextual AI responses
- **Crisis Detection**: Automatic detection of crisis keywords with immediate escalation
- **Human Responder Escalation**: Seamless handoff to trained human responders when needed
- **iMessage Integration**: Native iMessage support via Series API

### For Responders
- **Real-time Alert Dashboard**: View and accept crisis alerts and help requests
- **Active Chat Management**: Manage multiple conversations with clear message differentiation
- **Session Control**: Start and end responder sessions with proper AI handoff
- **Chat Continuity**: Continue conversations in existing active chats when accepting new alerts
- **Message Differentiation**: Clear visual distinction between user, AI agent, and responder messages
- **Context Sidebar**: View user history, mood trends, and conversation context

## 🏗️ Architecture

### Tech Stack

**Backend:**
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (Neon)
- **Message Queue**: Kafka (optional, for Series API events)
- **AI Integration**: OpenAI GPT-4 (via MCP - Model Context Protocol)
- **External APIs**: Series API (iMessage), OpenAI API

**Frontend:**
- **Framework**: Next.js 16 with React 18
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI
- **State Management**: Zustand
- **3D Graphics**: Three.js, React Three Fiber
- **Forms**: React Hook Form with Zod validation

### System Architecture

```
┌─────────────┐
│   User      │
│  (iMessage) │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│   Series API    │
│  (iMessage API) │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐     ┌──────────────┐
│  Kafka Consumer │────▶│   Processor  │
│  (Events)       │     │  (MCP/AI)    │
└─────────────────┘     └──────┬───────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        ┌───────────┐   ┌───────────┐   ┌───────────┐
        │ PostgreSQL│   │  OpenAI   │   │  Express  │
        │  Database │   │    API    │   │   Server  │
        └───────────┘   └───────────┘   └─────┬─────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │   Frontend   │
                                        │  (Next.js)   │
                                        └──────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL database (Neon recommended)
- Series API account and credentials
- OpenAI API key (optional, for AI responses)
- Kafka credentials (optional, for event streaming)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ThilakNarasimhamurthy/series_hackathon.git
   cd series_hackathon
   ```

2. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd ../Frontend
   npm install
   ```

### Environment Setup

#### Backend (.env)

Create a `.env` file in the `backend/` directory:

```bash
# Server Configuration
PORT=3000
FRONTEND_URL=http://localhost:3001

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:password@host/database

# Series API (iMessage)
SERIES_API_KEY=your_series_api_key
SERIES_API_URL=https://api.series.dev
SERIES_SENDER_NUMBER=+1234567890

# OpenAI (for AI responses)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

# Kafka (optional, for event streaming)
ENABLE_KAFKA=false
KAFKA_BROKER=your_kafka_broker
KAFKA_TOPIC=your_topic
KAFKA_CLIENT_ID=your_client_id
KAFKA_USERNAME=your_username
KAFKA_PASSWORD=your_password
```

#### Frontend (.env.local)

Create a `.env.local` file in the `Frontend/` directory:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Database Setup

1. **Initialize the database schema**
   ```bash
   cd backend
   npm run db:init
   ```

2. **Migrate anonymous names** (if needed)
   ```bash
   npm run db:migrate-anonymous
   ```

### Running the Application

1. **Start the backend server**
   ```bash
   cd backend
   npm run dev
   ```
   Backend will run on `http://localhost:3000`

2. **Start the frontend server** (in a new terminal)
   ```bash
   cd Frontend
   npm run dev
   ```
   Frontend will run on `http://localhost:3001`

3. **Verify the setup**
   ```bash
   # Test backend health
   curl http://localhost:3000/health
   
   # Expected response:
   # {"status":"ok","timestamp":"...","database":"connected"}
   ```

## 📁 Project Structure

```
series_hackathon/
├── backend/
│   ├── src/
│   │   ├── server.ts              # Express server & API routes
│   │   ├── db/
│   │   │   ├── index.ts          # Database connection
│   │   │   ├── queries.ts        # Database query functions
│   │   │   ├── schema.sql        # Database schema
│   │   │   └── init.ts           # Schema initialization
│   │   ├── api/
│   │   │   └── seriesClient.ts   # Series API client
│   │   ├── mcp/
│   │   │   ├── server.ts         # MCP server
│   │   │   ├── processor.ts      # Event processor
│   │   │   ├── aiService.ts      # AI response generation
│   │   │   └── analysis.ts       # Mood & sentiment analysis
│   │   ├── kafka/
│   │   │   ├── consumer.ts       # Kafka consumer
│   │   │   └── types.ts          # Event types
│   │   └── middleware/
│   │       ├── rateLimiter.ts    # API rate limiting
│   │       └── chatRateLimiter.ts # Per-chat rate limiting
│   └── package.json
│
├── Frontend/
│   ├── src/
│   │   ├── app/                   # Next.js app directory
│   │   │   ├── page.tsx          # Landing page
│   │   │   └── dashboard/        # Responder dashboard
│   │   ├── components/
│   │   │   ├── landing/          # Landing page components
│   │   │   ├── responder/        # Responder dashboard components
│   │   │   └── ui/               # Reusable UI components
│   │   └── lib/
│   │       ├── api.ts            # API client
│   │       └── utils.ts          # Utility functions
│   └── package.json
│
└── README.md
```

## 🔌 API Endpoints

### User Endpoints

- `POST /api/send-welcome` - Send welcome message to user
- `GET /api/user/:phone` - Get user information
- `GET /api/user/:phone/stats` - Get user statistics

### Responder Endpoints

- `GET /api/responder/:responderId/chats` - Get responder's active chats
- `GET /api/alerts/pending` - Get pending alerts
- `POST /api/alert/:alertId/accept` - Accept an alert
- `GET /api/chat/:chatId` - Get chat with messages
- `POST /api/chat/:chatId/message` - Send message as responder
- `PUT /api/chat/:chatId/status` - Update chat status (active/ended/archived)

### System Endpoints

- `GET /health` - Health check
- `GET /api/stats` - System statistics

## 🔄 Key Workflows

### User Journey

1. **User sends message** → Series API receives message
2. **Kafka event** → `message.received` event triggers processor
3. **Message processing**:
   - Check for mood emojis → Store check-in
   - Check for crisis keywords → Create alert
   - Check for help requests → Create alert
   - Default → Store as journal entry
4. **AI response** → Generate contextual response (if no responder active)
5. **Responder escalation** → If crisis detected, create alert for responders

### Responder Workflow

1. **View alerts** → Responder sees pending alerts in dashboard
2. **Accept alert** → Responder accepts, system checks for existing active chat
3. **Chat assignment**:
   - If responder has active chat with user → Continue in that chat
   - If no active chat → Create new chat or reuse existing active chat
4. **Send messages** → Responder sends messages via dashboard
5. **End session** → Responder ends session, AI takes over

### AI Handoff Logic

- **When responder is active**: AI is completely disabled, no messages sent
- **When session ends**: `responder_id` cleared, AI resumes handling
- **Message blocking**: `sendMessageToUser` checks for active responder before sending

## 🛡️ Security & Privacy

- **Anonymous names**: Users are assigned anonymous names, phone numbers are not exposed
- **Rate limiting**: API endpoints are rate-limited (20 requests/minute)
- **Chat rate limiting**: Per-chat message rate limiting (3 seconds between messages)
- **CORS protection**: Frontend-backend communication secured
- **Error sanitization**: API keys and sensitive data are sanitized in logs

## 🧪 Development

### Backend Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm run start        # Start production server
npm run db:init      # Initialize database schema
npm run mcp:server   # Run MCP server standalone
```

### Frontend Scripts

```bash
npm run dev          # Start Next.js development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

## 📝 Key Features Explained

### Crisis Detection

The system automatically detects crisis keywords in user messages and:
1. Creates a high-severity alert
2. Provides immediate AI support with crisis resources
3. Makes alert available for responder acceptance
4. Escalates to human responder when accepted

### Chat Continuity

When a responder accepts an alert:
- System first checks if responder already has an active chat with that user
- If yes, continues in the existing chat (no duplicate chats)
- If no, checks for any active chat with that user
- Creates new chat only if no active chat exists

### Message Differentiation

Messages are clearly labeled:
- **User messages**: Gray bubbles, left-aligned
- **AI Agent messages**: Purple bubbles, right-aligned
- **Responder messages**: Blue bubbles, right-aligned
- **System messages**: Centered notifications for responder entry/exit

### Rate Limiting

- **General API**: 20 requests per minute
- **Send Welcome**: 20 requests per minute (strict)
- **Per-Chat Messages**: 1 message per 3 seconds (20 per minute)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is part of the Series Hackathon.

## 🙏 Acknowledgments

- Series API for iMessage integration
- OpenAI for AI capabilities
- Neon for PostgreSQL hosting
- All contributors and testers

---

**Built with ❤️ for mental health support**

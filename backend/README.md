# Mental Health Support Backend

Backend service for processing mental health events via Kafka, analyzing mood trends, detecting crises, and managing responder matching.

## ✅ Completed Checkpoints

### Checkpoint 0: Project Setup ✅
- [x] Project structure created
- [x] Dependencies installed
- [x] TypeScript configured

### Checkpoint 1: Database Connection ✅
- [x] Neon PostgreSQL connected
- [x] Database schema created
- [x] All tables initialized
- [x] Connection tested successfully

### Checkpoint 2: Express Server ✅
- [x] Express server running
- [x] Health check endpoint working
- [x] Database connection verified in health check

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Neon PostgreSQL connection string
- Series API credentials
- Kafka credentials

### Installation

```bash
npm install
```

### Environment Setup

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

### Initialize Database

```bash
npm run db:init
```

### Test Database Connection

```bash
npm run db:test
```

### Run Development Server

```bash
npm run dev
```

Server will start on `http://localhost:3000`

### Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "database": "connected"
}
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── server.ts           # Express server
│   ├── db/
│   │   ├── index.ts        # Database connection
│   │   ├── schema.sql      # Database schema
│   │   ├── init.ts         # Schema initialization
│   │   ├── test.ts         # Database tests
│   │   └── queries.ts      # Database query functions
│   ├── api/                 # API clients (coming soon)
│   ├── kafka/               # Kafka consumer (coming soon)
│   ├── mcp/                 # MCP processor (coming soon)
│   └── routes/              # API routes (coming soon)
├── package.json
├── tsconfig.json
└── .env
```

## 🔄 Next Checkpoints

### Checkpoint 3: Series API Client
- Create Series API wrapper
- Test sending messages
- Test creating chats

### Checkpoint 4: Kafka Consumer
- Set up Kafka consumer
- Connect to Kafka cluster
- Subscribe to topic

### Checkpoint 5: Event Processor
- Create event processor
- Handle event types
- Route to handlers

## 📊 Database Schema

- **users**: User accounts (identified by phone)
- **checkins**: Mood check-in history
- **journal_entries**: Journal entries with sentiment
- **responders**: Human responders
- **chats**: Chat sessions
- **risk_alerts**: Crisis alerts

## 🧪 Testing

Run all tests:
```bash
npm run test:db
npm run test:series-api
npm run test:processor
# ... etc
```

## 📝 API Endpoints

### Health Check
```
GET /health
```

Returns server status and database connection state.

## 🔐 Environment Variables

See `.env.example` for required variables:
- `DATABASE_URL`: Neon PostgreSQL connection string
- `KAFKA_BROKER`: Kafka broker address
- `KAFKA_TOPIC`: Your team's Kafka topic
- `SERIES_API_KEY`: Series API key
- `PORT`: Server port (default: 3000)


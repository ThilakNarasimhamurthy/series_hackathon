-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100),
  anonymous_name VARCHAR(100),
  user_type VARCHAR(20) DEFAULT 'regular',
  onboarded BOOLEAN DEFAULT false,
  onboarding_sent_at TIMESTAMP,
  first_message_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  last_checkin_at TIMESTAMP,
  metadata JSONB
);

-- Mood check-ins
CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  mood VARCHAR(10) NOT NULL,
  tags TEXT[],
  text TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  event_type VARCHAR(50) DEFAULT 'mood_checkin'
);

-- Journal entries
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sentiment VARCHAR(20),
  keywords TEXT[],
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Responders
CREATE TABLE IF NOT EXISTS responders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE,
  phone VARCHAR(20),
  is_available BOOLEAN DEFAULT false,
  specialty VARCHAR(50) DEFAULT 'peer',
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP,
  stats JSONB
);

-- Chat sessions
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  responder_id UUID REFERENCES responders(id) ON DELETE SET NULL,
  series_chat_id VARCHAR(100),
  type VARCHAR(50) DEFAULT 'general',
  status VARCHAR(50) DEFAULT 'active',
  context JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP
);

-- Risk alerts
CREATE TABLE IF NOT EXISTS risk_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  responder_id UUID REFERENCES responders(id),
  chat_id UUID REFERENCES chats(id),
  severity VARCHAR(20) DEFAULT 'medium',
  context JSONB,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_checkins_user_timestamp ON checkins(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_timestamp ON checkins(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_responders_available ON responders(is_available) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_chats_status ON chats(status);
CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_responder ON chats(responder_id);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_status ON risk_alerts(status) WHERE status = 'pending';


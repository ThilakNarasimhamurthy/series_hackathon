import { query } from './index.js';

// User operations
export async function createOrGetUser(phone: string, name?: string) {
  const result = await query(
    `INSERT INTO users (phone, name) 
     VALUES ($1, $2) 
     ON CONFLICT (phone) 
     DO UPDATE SET phone = $1
     RETURNING *`,
    [phone, name || null]
  );
  return result.rows[0];
}

export async function getUserById(userId: string) {
  const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0];
}

export async function getUserByPhone(phone: string) {
  const result = await query('SELECT * FROM users WHERE phone = $1', [phone]);
  return result.rows[0];
}

export async function markUserOnboarded(userId: string) {
  const result = await query(
    `UPDATE users 
     SET onboarded = true, onboarding_sent_at = NOW() 
     WHERE id = $1 
     RETURNING *`,
    [userId]
  );
  return result.rows[0];
}

// Check-in operations
export async function createCheckin(userId: string, mood: string, tags: string[] = [], text: string | null = null) {
  const result = await query(
    `INSERT INTO checkins (user_id, mood, tags, text) 
     VALUES ($1, $2, $3, $4) 
     RETURNING *`,
    [userId, mood, tags, text]
  );
  
  // Update user's last_checkin_at
  await query(
    'UPDATE users SET last_checkin_at = NOW() WHERE id = $1',
    [userId]
  );
  
  return result.rows[0];
}

export async function getLast7Checkins(userId: string) {
  const result = await query(
    `SELECT mood, tags, text, timestamp 
     FROM checkins 
     WHERE user_id = $1 
     ORDER BY timestamp DESC 
     LIMIT 7`,
    [userId]
  );
  return result.rows;
}

// Responder operations
export async function findAvailableResponder(specialty: string | null = null) {
  let sql = `SELECT * FROM responders WHERE is_available = true`;
  const params: any[] = [];
  
  if (specialty) {
    sql += ` AND specialty = $1`;
    params.push(specialty);
  }
  
  sql += ` LIMIT 1`;
  
  const result = await query(sql, params);
  return result.rows[0] || null;
}

export async function updateResponderAvailability(responderId: string, isAvailable: boolean) {
  const result = await query(
    'UPDATE responders SET is_available = $1, last_active_at = NOW() WHERE id = $2 RETURNING *',
    [isAvailable, responderId]
  );
  return result.rows[0];
}

export async function getAllResponders() {
  const result = await query('SELECT * FROM responders ORDER BY created_at DESC');
  return result.rows;
}

// Chat operations
export async function createChat(userId: string, responderId: string | null, type: string = 'general', context: any = {}) {
  // Extract series_chat_id from context if provided
  const seriesChatId = context.series_chat_id || null;
  const contextWithoutChatId = { ...context };
  delete contextWithoutChatId.series_chat_id;

  const result = await query(
    `INSERT INTO chats (user_id, responder_id, type, series_chat_id, context) 
     VALUES ($1, $2, $3, $4, $5) 
     RETURNING *`,
    [userId, responderId, type, seriesChatId, JSON.stringify(contextWithoutChatId)]
  );
  return result.rows[0];
}

export async function getActiveChats(responderId: string) {
  const result = await query(
    `SELECT c.*, u.phone as user_phone 
     FROM chats c
     JOIN users u ON c.user_id = u.id
     WHERE c.responder_id = $1 AND c.status = 'active'
     ORDER BY c.created_at DESC`,
    [responderId]
  );
  return result.rows;
}

export async function getChatBySeriesId(seriesChatId: string) {
  const result = await query('SELECT * FROM chats WHERE series_chat_id = $1', [seriesChatId]);
  return result.rows[0];
}

// Journal operations
export async function createJournalEntry(userId: string, content: string, sentiment: string | null = null, keywords: string[] = []) {
  const result = await query(
    `INSERT INTO journal_entries (user_id, content, sentiment, keywords) 
     VALUES ($1, $2, $3, $4) 
     RETURNING *`,
    [userId, content, sentiment, keywords]
  );
  return result.rows[0];
}

// Risk alert operations
export async function createRiskAlert(userId: string, responderId: string | null, chatId: string | null, severity: string, context: any) {
  const result = await query(
    `INSERT INTO risk_alerts (user_id, responder_id, chat_id, severity, context) 
     VALUES ($1, $2, $3, $4, $5) 
     RETURNING *`,
    [userId, responderId, chatId, severity, JSON.stringify(context)]
  );
  return result.rows[0];
}

export async function getPendingRiskAlerts(responderId?: string) {
  let sql = `SELECT ra.*, u.phone as user_phone 
             FROM risk_alerts ra
             JOIN users u ON ra.user_id = u.id
             WHERE ra.status = 'pending'`;
  const params: any[] = [];
  
  if (responderId) {
    sql += ` AND ra.responder_id = $1`;
    params.push(responderId);
  }
  
  sql += ` ORDER BY ra.created_at DESC`;
  
  const result = await query(sql, params);
  return result.rows;
}


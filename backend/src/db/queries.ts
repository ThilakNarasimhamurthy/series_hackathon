import { query } from './index.js';
import { generateAnonymousName } from '../utils/anonymousNames.js';

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
  
  // Generate anonymous name if it doesn't exist
  if (!result.rows[0].anonymous_name) {
    const anonymousName = generateAnonymousName(result.rows[0].id);
    await query('UPDATE users SET anonymous_name = $1 WHERE id = $2', [anonymousName, result.rows[0].id]);
    result.rows[0].anonymous_name = anonymousName;
  }
  
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
    `SELECT c.*, 
            COALESCE(u.anonymous_name, 'Anonymous User') as user_display_name,
            u.id as user_id
     FROM chats c
     JOIN users u ON c.user_id = u.id
     WHERE c.responder_id = $1 AND c.status = 'active'
     ORDER BY c.created_at DESC`,
    [responderId]
  );
  
  // Generate anonymous names for any users that don't have one
  for (const row of result.rows) {
    if (!row.user_display_name || row.user_display_name === 'Anonymous User') {
      const anonymousName = generateAnonymousName(row.user_id);
      await query('UPDATE users SET anonymous_name = $1 WHERE id = $2', [anonymousName, row.user_id]);
      row.user_display_name = anonymousName;
    }
  }
  
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
  let sql = `SELECT ra.*, 
                    COALESCE(u.anonymous_name, 'Anonymous User') as user_display_name,
                    u.id as user_id
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
  
  // Generate anonymous names for any users that don't have one
  for (const row of result.rows) {
    if (!row.user_display_name || row.user_display_name === 'Anonymous User') {
      const anonymousName = generateAnonymousName(row.user_id);
      await query('UPDATE users SET anonymous_name = $1 WHERE id = $2', [anonymousName, row.user_id]);
      row.user_display_name = anonymousName;
    }
  }
  
  return result.rows;
}

export async function getRiskAlertById(alertId: string) {
  const result = await query(
    `SELECT ra.*, 
            COALESCE(u.anonymous_name, 'Anonymous User') as user_display_name,
            u.id as user_id
     FROM risk_alerts ra
     JOIN users u ON ra.user_id = u.id
     WHERE ra.id = $1`,
    [alertId]
  );
  
  if (result.rows[0] && (!result.rows[0].user_display_name || result.rows[0].user_display_name === 'Anonymous User')) {
    const anonymousName = generateAnonymousName(result.rows[0].user_id);
    await query('UPDATE users SET anonymous_name = $1 WHERE id = $2', [anonymousName, result.rows[0].user_id]);
    result.rows[0].user_display_name = anonymousName;
  }
  
  return result.rows[0];
}

export async function updateRiskAlertStatus(alertId: string, status: string, responderId?: string) {
  let sql = `UPDATE risk_alerts SET status = $1, resolved_at = NOW()`;
  const params: any[] = [status];
  
  if (responderId) {
    sql += `, responder_id = $2 WHERE id = $3 RETURNING *`;
    params.push(responderId, alertId);
  } else {
    sql += ` WHERE id = $2 RETURNING *`;
    params.push(alertId);
  }
  
  const result = await query(sql, params);
  return result.rows[0];
}

// Journal entry operations
export async function getJournalEntries(userId: string, limit: number = 50) {
  const result = await query(
    `SELECT id, content, sentiment, keywords, timestamp 
     FROM journal_entries 
     WHERE user_id = $1 
     ORDER BY timestamp DESC 
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

// Chat operations (additional)
export async function getChatById(chatId: string, includePhone: boolean = false) {
  const phoneField = includePhone 
    ? 'u.phone as user_phone,' 
    : 'COALESCE(u.anonymous_name, \'Anonymous User\') as user_display_name,';
    
  const result = await query(
    `SELECT c.*, 
            ${phoneField}
            u.id as user_id,
            r.name as responder_name
     FROM chats c
     LEFT JOIN users u ON c.user_id = u.id
     LEFT JOIN responders r ON c.responder_id = r.id
     WHERE c.id = $1`,
    [chatId]
  );
  
  if (result.rows[0] && result.rows[0].user_id && (!result.rows[0].user_display_name || result.rows[0].user_display_name === 'Anonymous User')) {
    const anonymousName = generateAnonymousName(result.rows[0].user_id);
    await query('UPDATE users SET anonymous_name = $1 WHERE id = $2', [anonymousName, result.rows[0].user_id]);
    result.rows[0].user_display_name = anonymousName;
  }
  
  return result.rows[0];
}

export async function getUserChats(userId: string) {
  const result = await query(
    `SELECT c.*, r.name as responder_name, r.specialty
     FROM chats c
     LEFT JOIN responders r ON c.responder_id = r.id
     WHERE c.user_id = $1
     ORDER BY c.created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function updateChatStatus(chatId: string, status: string) {
  const result = await query(
    `UPDATE chats 
     SET status = $1, ended_at = CASE WHEN $1 = 'ended' THEN NOW() ELSE ended_at END
     WHERE id = $2 
     RETURNING *`,
    [status, chatId]
  );
  return result.rows[0];
}

// Responder operations (additional)
export async function createResponder(name: string, email?: string, phone?: string, specialty: string = 'peer') {
  const result = await query(
    `INSERT INTO responders (name, email, phone, specialty, is_available) 
     VALUES ($1, $2, $3, $4, false) 
     RETURNING *`,
    [name, email || null, phone || null, specialty]
  );
  return result.rows[0];
}

export async function getResponderById(responderId: string) {
  const result = await query('SELECT * FROM responders WHERE id = $1', [responderId]);
  return result.rows[0];
}

export async function updateResponder(responderId: string, updates: { name?: string; email?: string; phone?: string; specialty?: string }) {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.email !== undefined) {
    fields.push(`email = $${paramIndex++}`);
    values.push(updates.email);
  }
  if (updates.phone !== undefined) {
    fields.push(`phone = $${paramIndex++}`);
    values.push(updates.phone);
  }
  if (updates.specialty !== undefined) {
    fields.push(`specialty = $${paramIndex++}`);
    values.push(updates.specialty);
  }

  if (fields.length === 0) {
    return await getResponderById(responderId);
  }

  values.push(responderId);
  const sql = `UPDATE responders SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
  const result = await query(sql, values);
  return result.rows[0];
}

// Statistics operations
export async function getUserStats(userId: string) {
  const checkinsResult = await query(
    `SELECT COUNT(*) as total_checkins, 
            COUNT(DISTINCT DATE(timestamp)) as unique_days,
            MIN(timestamp) as first_checkin,
            MAX(timestamp) as last_checkin
     FROM checkins 
     WHERE user_id = $1`,
    [userId]
  );

  const journalResult = await query(
    `SELECT COUNT(*) as total_entries,
            COUNT(DISTINCT DATE(timestamp)) as unique_days
     FROM journal_entries 
     WHERE user_id = $1`,
    [userId]
  );

  const alertsResult = await query(
    `SELECT COUNT(*) as total_alerts,
            COUNT(*) FILTER (WHERE status = 'pending') as pending_alerts
     FROM risk_alerts 
     WHERE user_id = $1`,
    [userId]
  );

  return {
    checkins: checkinsResult.rows[0],
    journal: journalResult.rows[0],
    alerts: alertsResult.rows[0]
  };
}

export async function getSystemStats() {
  const usersResult = await query('SELECT COUNT(*) as total_users FROM users');
  const respondersResult = await query('SELECT COUNT(*) as total_responders, COUNT(*) FILTER (WHERE is_available = true) as available_responders FROM responders');
  const chatsResult = await query('SELECT COUNT(*) as total_chats, COUNT(*) FILTER (WHERE status = \'active\') as active_chats FROM chats');
  const alertsResult = await query('SELECT COUNT(*) as total_alerts, COUNT(*) FILTER (WHERE status = \'pending\') as pending_alerts FROM risk_alerts');

  return {
    users: usersResult.rows[0],
    responders: respondersResult.rows[0],
    chats: chatsResult.rows[0],
    alerts: alertsResult.rows[0]
  };
}


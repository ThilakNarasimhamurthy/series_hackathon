import { query } from '../db/index.js';
import { seriesClient } from '../api/seriesClient.js';
import dotenv from 'dotenv';

dotenv.config();

async function getAllChatsAndMessages() {
  try {
    console.log('📊 Fetching all chats and messages...\n');
    console.log('=' .repeat(80));
    
    // Get all chats from database
    const dbChatsResult = await query(`
      SELECT 
        c.id as db_chat_id,
        c.series_chat_id,
        c.type,
        c.status,
        c.created_at,
        u.phone as user_phone,
        u.id as user_id
      FROM chats c
      LEFT JOIN users u ON c.user_id = u.id
      ORDER BY c.created_at DESC
    `);
    
    console.log(`\n📁 DATABASE CHATS (${dbChatsResult.rows.length} total):\n`);
    if (dbChatsResult.rows.length === 0) {
      console.log('   No chats found in database.\n');
    } else {
      dbChatsResult.rows.forEach((chat, idx) => {
        console.log(`${idx + 1}. Database Chat ID: ${chat.db_chat_id}`);
        console.log(`   Series Chat ID: ${chat.series_chat_id || 'N/A'}`);
        console.log(`   Type: ${chat.type}`);
        console.log(`   Status: ${chat.status}`);
        console.log(`   User Phone: ${chat.user_phone || 'N/A'}`);
        console.log(`   User ID: ${chat.user_id || 'N/A'}`);
        console.log(`   Created: ${chat.created_at}`);
        console.log('');
      });
    }
    
    // Get all chats from Series API
    console.log('=' .repeat(80));
    console.log(`\n📡 SERIES API CHATS:\n`);
    
    try {
      const seriesChats = await seriesClient.listChats(undefined, 1, 100);
      
      console.log(`   Found ${seriesChats.length} chat(s) in Series API:\n`);
      
      for (let i = 0; i < seriesChats.length; i++) {
        const chat = seriesChats[i];
        console.log(`${i + 1}. Series Chat ID: ${chat.id}`);
        console.log(`   Display Name: ${chat.display_name || 'N/A'}`);
        console.log(`   Phone Numbers: ${chat.phone_numbers?.join(', ') || 'N/A'}`);
        
        // Get messages for this chat
        try {
          const messages = await seriesClient.getChatMessages(chat.id);
          console.log(`   Messages: ${messages.length} total`);
          
          if (messages.length > 0) {
            console.log(`   Recent Messages:`);
            messages.slice(0, 5).forEach((msg, idx) => {
              console.log(`     ${idx + 1}. Message ID: ${msg.id}`);
              console.log(`        Text: ${msg.text?.substring(0, 50) || 'N/A'}${msg.text && msg.text.length > 50 ? '...' : ''}`);
              console.log(`        Sent At: ${msg.sent_at || 'N/A'}`);
            });
            if (messages.length > 5) {
              console.log(`     ... and ${messages.length - 5} more messages`);
            }
          }
        } catch (msgError: any) {
          console.log(`   Messages: Error fetching - ${msgError.message}`);
        }
        
        console.log('');
      }
    } catch (apiError: any) {
      console.error(`   ❌ Error fetching Series API chats: ${apiError.message}`);
    }
    
    // Get users from database
    console.log('=' .repeat(80));
    const usersResult = await query(`
      SELECT 
        id,
        phone,
        name,
        created_at
      FROM users
      ORDER BY created_at DESC
    `);
    
    console.log(`\n👥 USERS (${usersResult.rows.length} total):\n`);
    if (usersResult.rows.length === 0) {
      console.log('   No users found.\n');
    } else {
      usersResult.rows.forEach((user, idx) => {
        console.log(`${idx + 1}. User ID: ${user.id}`);
        console.log(`   Phone: ${user.phone || 'N/A'}`);
        console.log(`   Name: ${user.name || 'N/A'}`);
        console.log(`   Created: ${user.created_at}`);
        console.log('');
      });
    }
    
    // Get check-ins
    console.log('=' .repeat(80));
    const checkinsResult = await query(`
      SELECT 
        id,
        user_id,
        mood,
        text,
        timestamp
      FROM checkins
      ORDER BY timestamp DESC
      LIMIT 50
    `);
    
    console.log(`\n📊 CHECK-INS (showing last ${checkinsResult.rows.length}):\n`);
    if (checkinsResult.rows.length === 0) {
      console.log('   No check-ins found.\n');
    } else {
      checkinsResult.rows.forEach((checkin, idx) => {
        console.log(`${idx + 1}. Check-in ID: ${checkin.id}`);
        console.log(`   User ID: ${checkin.user_id}`);
        console.log(`   Mood: ${checkin.mood}`);
        console.log(`   Text: ${checkin.text || 'N/A'}`);
        console.log(`   Created: ${checkin.timestamp}`);
        console.log('');
      });
    }
    
    // Get journal entries
    console.log('=' .repeat(80));
    const journalResult = await query(`
      SELECT 
        id,
        user_id,
        content,
        timestamp
      FROM journal_entries
      ORDER BY timestamp DESC
      LIMIT 50
    `);
    
    console.log(`\n📝 JOURNAL ENTRIES (showing last ${journalResult.rows.length}):\n`);
    if (journalResult.rows.length === 0) {
      console.log('   No journal entries found.\n');
    } else {
      journalResult.rows.forEach((entry, idx) => {
        console.log(`${idx + 1}. Journal Entry ID: ${entry.id}`);
        console.log(`   User ID: ${entry.user_id}`);
        console.log(`   Content: ${entry.content.substring(0, 80)}${entry.content.length > 80 ? '...' : ''}`);
        console.log(`   Created: ${entry.timestamp}`);
        console.log('');
      });
    }
    
    console.log('=' .repeat(80));
    console.log('\n✅ Summary complete!\n');
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

getAllChatsAndMessages();


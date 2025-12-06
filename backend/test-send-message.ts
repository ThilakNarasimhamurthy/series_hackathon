/**
 * Test script to verify Series API message sending
 */

import dotenv from 'dotenv';
import { seriesClient } from './src/api/seriesClient.js';

dotenv.config();

async function testSendMessage() {
  const phoneNumber = process.argv[2] || '+1234567890';
  const chatId = process.argv[3] || '1700000';
  const message = process.argv[4] || 'Test message from backend';

  console.log('🧪 Testing Series API Message Sending\n');
  console.log(`Phone Number: ${phoneNumber}`);
  console.log(`Chat ID: ${chatId}`);
  console.log(`Message: ${message}\n`);

  try {
    // Test 1: Verify chat exists
    console.log('📋 Test 1: Verifying chat exists...');
    try {
      const chat = await seriesClient.getChat(parseInt(chatId));
      console.log(`✅ Chat ${chatId} exists:`);
      console.log(`   ID: ${chat.id}`);
      console.log(`   Display Name: ${chat.display_name || 'N/A'}`);
      console.log(`   Phone Numbers: ${chat.phone_numbers?.join(', ') || 'N/A'}\n`);
    } catch (error: any) {
      console.error(`❌ Chat ${chatId} does not exist or error:`, error.response?.status || error.message);
      console.log(`   Will try to create new chat...\n`);
      
      // Try to create chat
      try {
        const newChat = await seriesClient.createChatWithMessage([phoneNumber], message, 'Test Chat');
        console.log(`✅ Created new chat: ${newChat.id}`);
        console.log(`   Try sending to this chat ID instead: ${newChat.id}\n`);
        return;
      } catch (createError: any) {
        console.error(`❌ Failed to create chat:`, createError.response?.status || createError.message);
        if (createError.response?.data) {
          console.error(`   Error details:`, JSON.stringify(createError.response.data, null, 2));
        }
        return;
      }
    }

    // Test 2: Send message
    console.log('📋 Test 2: Sending message...');
    const result = await seriesClient.sendTextMessage(parseInt(chatId), message);
    console.log(`✅ Message sent successfully!`);
    console.log(`   Message ID: ${result.id}`);
    console.log(`   Chat ID: ${result.chat_id}`);
    console.log(`   Sent At: ${result.sent_at}`);
    console.log(`   Text: ${result.text}\n`);

    // Test 3: Verify message was received
    console.log('📋 Test 3: Verifying message in chat...');
    const messages = await seriesClient.getChatMessages(parseInt(chatId));
    console.log(`✅ Found ${messages.length} message(s) in chat`);
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      console.log(`   Last message: "${lastMessage.text}"`);
      console.log(`   Sent at: ${lastMessage.sent_at}`);
    }

  } catch (error: any) {
    console.error('\n❌ Error during test:');
    console.error(`   Status: ${error.response?.status || 'N/A'}`);
    console.error(`   Status Text: ${error.response?.statusText || 'N/A'}`);
    console.error(`   Message: ${error.message}`);
    if (error.response?.data) {
      console.error(`   Response Data:`, JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testSendMessage().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});


/**
 * Example usage of OpenAI MCP Client
 * Demonstrates how to use OpenAI with MCP server tools
 */

import { getOpenAIMCPClient } from './openaiClient.js';
import dotenv from 'dotenv';

dotenv.config();

async function example() {
  try {
    console.log('🚀 Starting OpenAI MCP Client example...\n');

    // Get client instance (connects to MCP server automatically)
    const client = await getOpenAIMCPClient();

    console.log('📋 Available tools:', client.getAvailableTools().map(t => t.name).join(', '));
    console.log('');

    // Example 1: Simple message processing
    console.log('Example 1: Simple message processing');
    const response1 = await client.processMessage(
      "A user sent me a message saying they're feeling really down today. What should I do?"
    );
    console.log('Response:', response1);
    console.log('');

    // Example 2: Message with context
    console.log('Example 2: Message with user context');
    const response2 = await client.processMessage(
      "Check this user's recent mood check-ins and provide personalized support",
      {
        userPhone: '+1234567890',
        recentMoods: ['😞', '😐', '😞'],
        sentiment: 'negative',
      }
    );
    console.log('Response:', response2);
    console.log('');

    // Example 3: Direct chat with function calling
    console.log('Example 3: Direct chat with function calling');
    const response3 = await client.chat([
      {
        role: 'user',
        content: 'Get pending risk alerts and tell me what I should do about them',
      },
    ]);
    console.log('Response:', response3);
    console.log('');

    // Disconnect
    await client.disconnect();
    console.log('✅ Example completed');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run example if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  example();
}


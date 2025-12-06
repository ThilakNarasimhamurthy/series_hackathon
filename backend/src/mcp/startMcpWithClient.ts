/**
 * Start MCP Server with OpenAI Client
 * This ensures the MCP server is running and connected to a client
 */

import { getOpenAIMCPClient } from './openaiClient.js';
import dotenv from 'dotenv';

dotenv.config();

let mcpClient: Awaited<ReturnType<typeof getOpenAIMCPClient>> | null = null;

/**
 * Initialize and start MCP server with client
 */
export async function startMCPWithClient(): Promise<void> {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️  OPENAI_API_KEY not set. MCP client will not start.');
      console.log('   MCP server tools are still available via MCP protocol.');
      return;
    }

    console.log('🔄 Starting MCP server with OpenAI client...');
    
    // Get client instance (this spawns the MCP server and connects to it)
    mcpClient = await getOpenAIMCPClient();
    
    console.log('✅ MCP server started and client connected');
    console.log(`   Available tools: ${mcpClient.getAvailableTools().length}`);
    
    // Keep the process alive
    process.on('SIGTERM', async () => {
      await shutdown();
    });
    
    process.on('SIGINT', async () => {
      await shutdown();
    });
    
  } catch (error: any) {
    console.error('❌ Failed to start MCP server with client:', error.message);
    // Don't throw - allow server to continue without MCP client
  }
}

/**
 * Get the MCP client instance
 */
export function getMCPClient() {
  return mcpClient;
}

/**
 * Shutdown MCP client and server
 */
async function shutdown(): Promise<void> {
  if (mcpClient) {
    try {
      await mcpClient.disconnect();
      console.log('✅ MCP client disconnected');
    } catch (error: any) {
      console.error('❌ Error disconnecting MCP client:', error.message);
    }
  }
  process.exit(0);
}

// If run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  startMCPWithClient().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}


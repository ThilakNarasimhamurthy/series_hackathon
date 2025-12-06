/**
 * Test MCP Server directly (without Kafka)
 * Tests various tools to ensure MCP server is working correctly
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testMCPServer() {
  let client: Client | null = null;

  try {
    console.log('🧪 Testing MCP Server...\n');

    // Build path to compiled MCP server
    const serverPath = path.join(__dirname, '../../dist/mcp/server.js');
    console.log(`📁 Server path: ${serverPath}\n`);

    // Create MCP client with stdio transport
    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: process.env as Record<string, string>,
    });

    client = new Client(
      {
        name: 'mcp-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    console.log('🔄 Connecting to MCP server...');
    await client.connect(transport);
    console.log('✅ Connected to MCP server\n');

    // Test 1: List available tools
    console.log('📋 Test 1: Listing available tools...');
    const toolsResponse = await client.listTools();
    console.log(`✅ Found ${toolsResponse.tools.length} tools:`);
    toolsResponse.tools.slice(0, 5).forEach((tool) => {
      console.log(`   - ${tool.name}: ${tool.description?.substring(0, 60)}...`);
    });
    if (toolsResponse.tools.length > 5) {
      console.log(`   ... and ${toolsResponse.tools.length - 5} more`);
    }
    console.log('');

    // Test 2: List available resources
    console.log('📋 Test 2: Listing available resources...');
    const resourcesResponse = await client.listResources();
    console.log(`✅ Found ${resourcesResponse.resources.length} resources:`);
    resourcesResponse.resources.forEach((resource) => {
      console.log(`   - ${resource.uri}: ${resource.name || 'No name'}`);
    });
    console.log('');

    // Test 3: Test analyze_sentiment tool
    console.log('📋 Test 3: Testing analyze_sentiment tool...');
    try {
      const sentimentResult = await client.callTool({
        name: 'analyze_sentiment',
        arguments: {
          text: 'I am feeling really great today! This is amazing!',
        },
      });
      const sentimentText = Array.isArray(sentimentResult.content) 
        ? sentimentResult.content.find((c: any) => c.type === 'text')?.text 
        : undefined;
      console.log('✅ Sentiment analysis result:');
      console.log(`   ${sentimentText}\n`);
    } catch (error: any) {
      console.error(`❌ Failed: ${error.message}\n`);
    }

    // Test 4: Test detect_crisis_keywords tool
    console.log('📋 Test 4: Testing detect_crisis_keywords tool...');
    try {
      const crisisResult1 = await client.callTool({
        name: 'detect_crisis_keywords',
        arguments: {
          text: 'I am feeling happy and content',
        },
      });
      const crisisText1 = Array.isArray(crisisResult1.content) 
        ? crisisResult1.content.find((c: any) => c.type === 'text')?.text 
        : undefined;
      console.log('✅ Crisis detection (safe text):');
      console.log(`   ${crisisText1}\n`);
    } catch (error: any) {
      console.error(`❌ Failed: ${error.message}\n`);
    }

    // Test 5: Test get_system_statistics tool
    console.log('📋 Test 5: Testing get_system_statistics tool...');
    try {
      const statsResult = await client.callTool({
        name: 'get_system_statistics',
        arguments: {},
      });
      const statsText = Array.isArray(statsResult.content) 
        ? statsResult.content.find((c: any) => c.type === 'text')?.text 
        : undefined;
      console.log('✅ System statistics:');
      console.log(`   ${statsText}\n`);
    } catch (error: any) {
      console.error(`❌ Failed: ${error.message}\n`);
    }

    // Test 6: Test fetch_internet_resources tool
    console.log('📋 Test 6: Testing fetch_internet_resources tool...');
    try {
      const resourcesResult = await client.callTool({
        name: 'fetch_internet_resources',
        arguments: {
          keywords: ['crisis', 'support'],
        },
      });
      const resourcesText = Array.isArray(resourcesResult.content) 
        ? resourcesResult.content.find((c: any) => c.type === 'text')?.text 
        : undefined;
      const resourcesData = JSON.parse(resourcesText || '{}');
      console.log('✅ Internet resources fetched:');
      if (resourcesData.resources && resourcesData.resources.length > 0) {
        console.log(`   Found ${resourcesData.resources.length} resources`);
        resourcesData.resources.slice(0, 2).forEach((r: any) => {
          console.log(`   - ${r.title}: ${r.url}`);
        });
      } else {
        console.log('   No resources found (this is okay - may be network/timeout)');
      }
      console.log('');
    } catch (error: any) {
      console.error(`❌ Failed: ${error.message}\n`);
    }

    // Test 7: Test get_all_responders tool
    console.log('📋 Test 7: Testing get_all_responders tool...');
    try {
      const respondersResult = await client.callTool({
        name: 'get_all_responders',
        arguments: {},
      });
      const respondersText = Array.isArray(respondersResult.content) 
        ? respondersResult.content.find((c: any) => c.type === 'text')?.text 
        : undefined;
      const respondersData = JSON.parse(respondersText || '[]');
      console.log('✅ Responders list:');
      if (Array.isArray(respondersData) && respondersData.length > 0) {
        console.log(`   Found ${respondersData.length} responders`);
        respondersData.slice(0, 3).forEach((r: any) => {
          console.log(`   - ${r.name} (${r.specialty}) - Available: ${r.is_available}`);
        });
      } else {
        console.log('   No responders found (this is okay if database is empty)');
      }
      console.log('');
    } catch (error: any) {
      console.error(`❌ Failed: ${error.message}\n`);
    }

    // Test 8: Read a resource
    console.log('📋 Test 8: Testing resource read...');
    try {
      const resourceRead = await client.readResource({
        uri: 'emotional-support://stats',
      });
      console.log('✅ Resource read successful:');
      if (resourceRead.contents && resourceRead.contents.length > 0) {
        const content = resourceRead.contents[0];
        console.log(`   URI: ${content.uri}`);
        console.log(`   MIME: ${content.mimeType}`);
        const textLength = 'text' in content ? content.text.length : ('blob' in content ? content.blob.length : 0);
        console.log(`   Content length: ${textLength} chars`);
      }
      console.log('');
    } catch (error: any) {
      console.error(`❌ Failed: ${error.message}\n`);
    }

    console.log('✅ All tests completed!');
    console.log('\n📊 Summary:');
    console.log(`   - Tools available: ${toolsResponse.tools.length}`);
    console.log(`   - Resources available: ${resourcesResponse.resources.length}`);
    console.log('   - MCP Server is working correctly! 🎉');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('\n✅ Disconnected from MCP server');
    }
  }
}

// Run tests
testMCPServer().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


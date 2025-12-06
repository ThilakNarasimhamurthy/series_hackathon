/**
 * OpenAI MCP Client
 * Bridges OpenAI API with MCP Server tools
 * Allows OpenAI to use backend capabilities via MCP protocol
 */

import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

interface OpenAIFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

class OpenAIMCPClient {
  private mcpClient: Client | null = null;
  private mcpProcess: ChildProcess | null = null;
  private openaiApiKey: string;
  private openaiModel: string;
  private mcpTools: OpenAIFunction[] = [];

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (!this.openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
  }

  /**
   * Start MCP server process and connect client
   */
  async connect(): Promise<void> {
    try {
      console.log('🔄 Starting MCP server...');

      // Build path to compiled MCP server
      const serverPath = path.join(__dirname, '../../dist/mcp/server.js');

      // Spawn MCP server as subprocess
      this.mcpProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'production',
        },
      });

      // Create MCP client with stdio transport
      const transport = new StdioClientTransport({
        command: 'node',
        args: [serverPath],
        env: process.env as Record<string, string>,
      });

      this.mcpClient = new Client(
        {
          name: 'openai-mcp-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      await this.mcpClient.connect(transport);
      console.log('✅ Connected to MCP server');

      // Load available tools from MCP server
      await this.loadMCPTools();
      console.log(`✅ Loaded ${this.mcpTools.length} tools from MCP server`);
    } catch (error: any) {
      console.error('❌ Failed to connect to MCP server:', error.message);
      throw error;
    }
  }

  /**
   * Load available tools from MCP server and convert to OpenAI function format
   */
  private async loadMCPTools(): Promise<void> {
    if (!this.mcpClient) {
      throw new Error('MCP client not connected');
    }

    try {
      const toolsResponse = await this.mcpClient.listTools();
      this.mcpTools = toolsResponse.tools.map((tool) => {
        // Convert MCP tool schema to OpenAI function format
        const properties: Record<string, any> = {};
        const required: string[] = [];

        if (tool.inputSchema.properties) {
          for (const [key, value] of Object.entries(tool.inputSchema.properties)) {
            const prop = value as any;
            properties[key] = {
              type: prop.type || 'string',
              description: prop.description || '',
            };

            // Handle enums
            if (prop.enum) {
              properties[key].enum = prop.enum;
            }

            // Handle arrays
            if (prop.type === 'array' && prop.items) {
              properties[key].items = {
                type: prop.items.type || 'string',
              };
            }

            // Handle objects
            if (prop.type === 'object' && prop.properties) {
              properties[key].properties = prop.properties;
            }
          }
        }

        // Extract required fields
        if (tool.inputSchema.required) {
          required.push(...tool.inputSchema.required);
        }

        return {
          name: tool.name,
          description: tool.description || '',
          parameters: {
            type: 'object',
            properties,
            required: required.length > 0 ? required : undefined,
          },
        };
      });
    } catch (error: any) {
      console.error('❌ Failed to load MCP tools:', error.message);
      throw error;
    }
  }

  /**
   * Call an MCP tool
   */
  private async callMCPTool(name: string, args: any): Promise<string> {
    if (!this.mcpClient) {
      throw new Error('MCP client not connected');
    }

    try {
      const result = await this.mcpClient.callTool({
        name,
        arguments: args,
      });

      // Extract text content from MCP response
      if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        const textContent = result.content.find((c: any) => c.type === 'text');
        if (textContent && 'text' in textContent) {
          return textContent.text;
        }
      }

      return JSON.stringify(result, null, 2);
    } catch (error: any) {
      console.error(`❌ Failed to call MCP tool ${name}:`, error.message);
      throw error;
    }
  }

  /**
   * Call OpenAI API with function calling enabled
   */
  async chat(messages: OpenAIMessage[], systemPrompt?: string): Promise<string> {
    const allMessages: OpenAIMessage[] = [];

    // Add system prompt if provided
    if (systemPrompt) {
      allMessages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Add conversation messages
    allMessages.push(...messages);

    let response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: this.openaiModel,
        messages: allMessages,
        tools: this.mcpTools.length > 0 ? this.mcpTools.map((tool) => ({ type: 'function', function: tool })) : undefined,
        tool_choice: this.mcpTools.length > 0 ? 'auto' : undefined,
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    let assistantMessage = response.data.choices[0]?.message;

    // Handle function calls
    while (assistantMessage?.function_call) {
      const functionName = assistantMessage.function_call.name;
      const functionArgs = JSON.parse(assistantMessage.function_call.arguments || '{}');

      console.log(`🔧 Calling MCP tool: ${functionName}`);

      // Call MCP tool
      const toolResult = await this.callMCPTool(functionName, functionArgs);

      // Add assistant message with function call to conversation
      allMessages.push({
        role: 'assistant',
        content: '',
        function_call: assistantMessage.function_call,
      });

      // Add function result to conversation
      allMessages.push({
        role: 'function',
        name: functionName,
        content: toolResult,
      });

      // Continue conversation with function result
      response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.openaiModel,
          messages: allMessages,
          tools: this.mcpTools.map((tool) => ({ type: 'function', function: tool })),
          tool_choice: 'auto',
          temperature: 0.7,
          max_tokens: 1000,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      assistantMessage = response.data.choices[0]?.message;
    }

    // Return final assistant response
    return assistantMessage?.content || 'No response generated';
  }

  /**
   * Process a user message with context and MCP tools
   */
  async processMessage(
    userMessage: string,
    context?: {
      userPhone?: string;
      recentMoods?: string[];
      moodTrend?: any;
      sentiment?: string;
    }
  ): Promise<string> {
    const systemPrompt = `You are a compassionate emotional support assistant with access to backend tools.
You can:
- Access user data, check-ins, and journal entries
- Analyze mood trends and sentiment
- Fetch mental health resources from the internet
- Send messages to users
- Manage alerts and responders

Use the available tools to provide the best support possible.`;

    const messages: OpenAIMessage[] = [
      {
        role: 'user',
        content: userMessage + (context ? `\n\nContext: ${JSON.stringify(context)}` : ''),
      },
    ];

    return this.chat(messages, systemPrompt);
  }

  /**
   * Get available tools
   */
  getAvailableTools(): OpenAIFunction[] {
    return this.mcpTools;
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    if (this.mcpClient) {
      await this.mcpClient.close();
      this.mcpClient = null;
    }

    if (this.mcpProcess) {
      this.mcpProcess.kill();
      this.mcpProcess = null;
    }

    console.log('✅ Disconnected from MCP server');
  }
}

// Export singleton instance
let clientInstance: OpenAIMCPClient | null = null;

export async function getOpenAIMCPClient(): Promise<OpenAIMCPClient> {
  if (!clientInstance) {
    clientInstance = new OpenAIMCPClient();
    await clientInstance.connect();
  }
  return clientInstance;
}

export { OpenAIMCPClient };


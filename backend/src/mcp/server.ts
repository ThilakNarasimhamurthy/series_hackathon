/**
 * Model Context Protocol (MCP) Server
 * Exposes backend capabilities to AI assistants
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import {
  getUserByPhone,
  getUserById,
  getLast7Checkins,
  getJournalEntries,
  getUserStats,
  getSystemStats,
  getPendingRiskAlerts,
  getRiskAlertById,
  getAllResponders,
  getResponderById,
  getActiveChats,
  getChatById,
  getUserChats,
  createResponder,
  updateResponderAvailability,
  updateRiskAlertStatus,
} from '../db/queries.js';
import { analyzeMoodTrend, getAIRecommendation, analyzeSentiment, detectCrisisKeywords } from './analysis.js';
import { generateAIResponse, processMessageAndRespond } from './aiService.js';
import { seriesClient } from '../api/seriesClient.js';
import { fetchWebResource, searchMentalHealthResources, getStateCrisisResources, formatResourcesForMessage } from '../utils/webResources.js';

dotenv.config();

// Initialize MCP Server
const server = new Server(
  {
    name: 'emotional-support-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_user_data',
        description: 'Get user data by phone number or user ID',
        inputSchema: {
          type: 'object',
          properties: {
            phone: {
              type: 'string',
              description: 'User phone number (E.164 format)',
            },
            userId: {
              type: 'string',
              description: 'User ID (UUID)',
            },
          },
          oneOf: [{ required: ['phone'] }, { required: ['userId'] }],
        },
      },
      {
        name: 'get_user_checkins',
        description: 'Get user mood check-ins (last 7)',
        inputSchema: {
          type: 'object',
          properties: {
            phone: {
              type: 'string',
              description: 'User phone number (E.164 format)',
            },
            userId: {
              type: 'string',
              description: 'User ID (UUID)',
            },
          },
          oneOf: [{ required: ['phone'] }, { required: ['userId'] }],
        },
      },
      {
        name: 'get_user_journal',
        description: 'Get user journal entries',
        inputSchema: {
          type: 'object',
          properties: {
            phone: {
              type: 'string',
              description: 'User phone number (E.164 format)',
            },
            userId: {
              type: 'string',
              description: 'User ID (UUID)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of entries to return (default: 50)',
              default: 50,
            },
          },
          oneOf: [{ required: ['phone'] }, { required: ['userId'] }],
        },
      },
      {
        name: 'analyze_mood_trend',
        description: 'Analyze mood trend for a user based on recent check-ins',
        inputSchema: {
          type: 'object',
          properties: {
            phone: {
              type: 'string',
              description: 'User phone number (E.164 format)',
            },
            userId: {
              type: 'string',
              description: 'User ID (UUID)',
            },
          },
          oneOf: [{ required: ['phone'] }, { required: ['userId'] }],
        },
      },
      {
        name: 'analyze_sentiment',
        description: 'Analyze sentiment of text content',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text content to analyze',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'detect_crisis_keywords',
        description: 'Detect crisis keywords in text',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text content to check for crisis keywords',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'get_ai_recommendation',
        description: 'Get AI recommendation based on mood and trend',
        inputSchema: {
          type: 'object',
          properties: {
            mood: {
              type: 'string',
              description: 'Current mood emoji (e.g., 😊, 😞, 🆘)',
            },
            recentMoods: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of recent mood emojis for trend analysis',
            },
          },
          required: ['mood', 'recentMoods'],
        },
      },
      {
        name: 'get_pending_alerts',
        description: 'Get pending risk alerts (optionally filtered by responder)',
        inputSchema: {
          type: 'object',
          properties: {
            responderId: {
              type: 'string',
              description: 'Optional responder ID to filter alerts',
            },
          },
        },
      },
      {
        name: 'get_alert_details',
        description: 'Get details of a specific risk alert',
        inputSchema: {
          type: 'object',
          properties: {
            alertId: {
              type: 'string',
              description: 'Alert ID (UUID)',
            },
          },
          required: ['alertId'],
        },
      },
      {
        name: 'update_alert_status',
        description: 'Update risk alert status',
        inputSchema: {
          type: 'object',
          properties: {
            alertId: {
              type: 'string',
              description: 'Alert ID (UUID)',
            },
            status: {
              type: 'string',
              enum: ['pending', 'acknowledged', 'resolved', 'dismissed'],
              description: 'New status for the alert',
            },
            responderId: {
              type: 'string',
              description: 'Optional responder ID to assign',
            },
          },
          required: ['alertId', 'status'],
        },
      },
      {
        name: 'get_all_responders',
        description: 'Get all responders',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_responder_details',
        description: 'Get responder details by ID',
        inputSchema: {
          type: 'object',
          properties: {
            responderId: {
              type: 'string',
              description: 'Responder ID (UUID)',
            },
          },
          required: ['responderId'],
        },
      },
      {
        name: 'get_responder_chats',
        description: 'Get active chats for a responder',
        inputSchema: {
          type: 'object',
          properties: {
            responderId: {
              type: 'string',
              description: 'Responder ID (UUID)',
            },
          },
          required: ['responderId'],
        },
      },
      {
        name: 'update_responder_availability',
        description: 'Update responder availability status',
        inputSchema: {
          type: 'object',
          properties: {
            responderId: {
              type: 'string',
              description: 'Responder ID (UUID)',
            },
            isAvailable: {
              type: 'boolean',
              description: 'Whether responder is available',
            },
          },
          required: ['responderId', 'isAvailable'],
        },
      },
      {
        name: 'get_user_chats',
        description: 'Get all chats for a user',
        inputSchema: {
          type: 'object',
          properties: {
            phone: {
              type: 'string',
              description: 'User phone number (E.164 format)',
            },
            userId: {
              type: 'string',
              description: 'User ID (UUID)',
            },
          },
          oneOf: [{ required: ['phone'] }, { required: ['userId'] }],
        },
      },
      {
        name: 'get_chat_details',
        description: 'Get chat details by ID',
        inputSchema: {
          type: 'object',
          properties: {
            chatId: {
              type: 'string',
              description: 'Chat ID (UUID)',
            },
          },
          required: ['chatId'],
        },
      },
      {
        name: 'get_user_statistics',
        description: 'Get statistics for a user',
        inputSchema: {
          type: 'object',
          properties: {
            phone: {
              type: 'string',
              description: 'User phone number (E.164 format)',
            },
            userId: {
              type: 'string',
              description: 'User ID (UUID)',
            },
          },
          oneOf: [{ required: ['phone'] }, { required: ['userId'] }],
        },
      },
      {
        name: 'get_system_statistics',
        description: 'Get system-wide statistics',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'generate_ai_response',
        description: 'Generate AI-powered, emotion-aware response based on user message and context',
        inputSchema: {
          type: 'object',
          properties: {
            userMessage: {
              type: 'string',
              description: 'The user\'s message to respond to',
            },
            userPhone: {
              type: 'string',
              description: 'User phone number (E.164 format)',
            },
            recentMoods: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional: Recent mood check-ins for context',
            },
            moodTrend: {
              type: 'object',
              description: 'Optional: Mood trend analysis',
            },
            sentiment: {
              type: 'string',
              enum: ['positive', 'negative', 'neutral'],
              description: 'Optional: Detected sentiment',
            },
          },
          required: ['userMessage', 'userPhone'],
        },
      },
      {
        name: 'send_message_to_user',
        description: 'Send a message to a user via iMessage (Series API)',
        inputSchema: {
          type: 'object',
          properties: {
            phone: {
              type: 'string',
              description: 'User phone number (E.164 format)',
            },
            message: {
              type: 'string',
              description: 'Message text to send',
            },
            chatId: {
              type: 'string',
              description: 'Optional: Series chat ID (if replying to existing chat)',
            },
          },
          required: ['phone', 'message'],
        },
      },
      {
        name: 'process_and_respond',
        description: 'Process user message with AI analysis and automatically send appropriate response',
        inputSchema: {
          type: 'object',
          properties: {
            userMessage: {
              type: 'string',
              description: 'The user\'s message to process',
            },
            userPhone: {
              type: 'string',
              description: 'User phone number (E.164 format)',
            },
            chatId: {
              type: 'string',
              description: 'Optional: Series chat ID for replying',
            },
          },
          required: ['userMessage', 'userPhone'],
        },
      },
      {
        name: 'fetch_internet_resources',
        description: 'Fetch mental health and support resources from the internet based on keywords and location',
        inputSchema: {
          type: 'object',
          properties: {
            keywords: {
              type: 'array',
              items: { type: 'string' },
              description: 'Keywords to search for (e.g., ["crisis", "suicide", "depression"])',
            },
            location: {
              type: 'string',
              description: 'Optional: State or location for location-specific resources',
            },
            url: {
              type: 'string',
              description: 'Optional: Specific URL to fetch and parse',
            },
          },
        },
      },
      {
        name: 'send_resource_to_user',
        description: 'Send internet resources (links, information) to a user via iMessage. For responders to share helpful resources.',
        inputSchema: {
          type: 'object',
          properties: {
            phone: {
              type: 'string',
              description: 'User phone number (E.164 format)',
            },
            resources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['url', 'title'],
              },
              description: 'Array of resources to send (each with url, title, description)',
            },
            message: {
              type: 'string',
              description: 'Optional: Custom message to include with resources',
            },
            chatId: {
              type: 'string',
              description: 'Optional: Series chat ID (if replying to existing chat)',
            },
          },
          required: ['phone', 'resources'],
        },
      },
    ],
  };
});

/**
 * List available resources
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'emotional-support://users',
        name: 'Users',
        description: 'List of all users in the system',
        mimeType: 'application/json',
      },
      {
        uri: 'emotional-support://responders',
        name: 'Responders',
        description: 'List of all responders',
        mimeType: 'application/json',
      },
      {
        uri: 'emotional-support://alerts/pending',
        name: 'Pending Alerts',
        description: 'List of pending risk alerts',
        mimeType: 'application/json',
      },
      {
        uri: 'emotional-support://stats',
        name: 'System Statistics',
        description: 'System-wide statistics',
        mimeType: 'application/json',
      },
    ],
  };
});

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Arguments are required' }, null, 2),
        },
      ],
      isError: true,
    };
  }

  try {
    switch (name) {
      case 'get_user_data': {
        let user;
        if (args.phone) {
          user = await getUserByPhone(args.phone as string);
        } else if (args.userId) {
          user = await getUserById(args.userId as string);
        } else {
          throw new Error('Either phone or userId must be provided');
        }

        if (!user) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'User not found' }, null, 2),
              },
            ],
          };
        }

        // Generate anonymous name if missing
        if (!user.anonymous_name) {
          const { generateAnonymousName } = await import('../utils/anonymousNames.js');
          const anonymousName = generateAnonymousName(user.id);
          const { query } = await import('../db/index.js');
          await query('UPDATE users SET anonymous_name = $1 WHERE id = $2', [anonymousName, user.id]);
          user.anonymous_name = anonymousName;
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: user.id,
                  anonymous_name: user.anonymous_name, // Return anonymous name instead of phone
                  name: user.name,
                  user_type: user.user_type,
                  onboarded: user.onboarded,
                  first_message_at: user.first_message_at,
                  last_checkin_at: user.last_checkin_at,
                  created_at: user.created_at,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'get_user_checkins': {
        let user;
        if (args.phone) {
          user = await getUserByPhone(args.phone as string);
        } else if (args.userId) {
          user = await getUserById(args.userId as string);
        } else {
          throw new Error('Either phone or userId must be provided');
        }

        if (!user) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'User not found' }, null, 2),
              },
            ],
          };
        }

        const checkins = await getLast7Checkins(user.id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(checkins, null, 2),
            },
          ],
        };
      }

      case 'get_user_journal': {
        let user;
        if (args.phone) {
          user = await getUserByPhone(args.phone as string);
        } else if (args.userId) {
          user = await getUserById(args.userId as string);
        } else {
          throw new Error('Either phone or userId must be provided');
        }

        if (!user) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'User not found' }, null, 2),
              },
            ],
          };
        }

        const limit = typeof args.limit === 'number' ? args.limit : 50;
        const entries = await getJournalEntries(user.id, limit);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(entries, null, 2),
            },
          ],
        };
      }

      case 'analyze_mood_trend': {
        let user;
        if (args.phone) {
          user = await getUserByPhone(args.phone as string);
        } else if (args.userId) {
          user = await getUserById(args.userId as string);
        } else {
          throw new Error('Either phone or userId must be provided');
        }

        if (!user) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'User not found' }, null, 2),
              },
            ],
          };
        }

        const checkins = await getLast7Checkins(user.id);
        const moods = checkins.map((c: any) => c.mood);
        const trend = analyzeMoodTrend(moods);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  recentMoods: moods,
                  trend: trend.trend,
                  isDeclining: trend.isDeclining,
                  severity: trend.severity,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'analyze_sentiment': {
        const text = args.text as string;
        if (!text) {
          throw new Error('text is required');
        }
        const sentiment = analyzeSentiment(text);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ sentiment, text }, null, 2),
            },
          ],
        };
      }

      case 'detect_crisis_keywords': {
        const text = args.text as string;
        if (!text) {
          throw new Error('text is required');
        }
        const hasCrisisKeywords = detectCrisisKeywords(text);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  hasCrisisKeywords,
                  text,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'get_ai_recommendation': {
        const mood = args.mood as string;
        const recentMoods = args.recentMoods as string[];
        if (!mood || !recentMoods) {
          throw new Error('mood and recentMoods are required');
        }
        const trend = analyzeMoodTrend(recentMoods);
        const recommendation = getAIRecommendation(mood, trend);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  mood: args.mood,
                  recommendation,
                  trend: trend.trend,
                  severity: trend.severity,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'get_pending_alerts': {
        const alerts = await getPendingRiskAlerts(args.responderId as string | undefined);
        // Remove user_phone, only return user_display_name
        const safeAlerts = alerts.map((alert: any) => {
          const { user_phone, ...safeAlert } = alert;
          return {
            ...safeAlert,
            user_display_name: alert.user_display_name,
            user_id: alert.user_id
          };
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(safeAlerts, null, 2),
            },
          ],
        };
      }

      case 'get_alert_details': {
        const alertId = args.alertId as string;
        if (!alertId) {
          throw new Error('alertId is required');
        }
        const alert = await getRiskAlertById(alertId);
        if (!alert) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Alert not found' }, null, 2),
              },
            ],
          };
        }
        // Remove user_phone, only return user_display_name
        const { user_phone, ...safeAlert } = alert;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...safeAlert,
                user_display_name: alert.user_display_name,
                user_id: alert.user_id
              }, null, 2),
            },
          ],
        };
      }

      case 'update_alert_status': {
        const alertId = args.alertId as string;
        const status = args.status as string;
        const responderId = args.responderId as string | undefined;
        if (!alertId || !status) {
          throw new Error('alertId and status are required');
        }
        const alert = await updateRiskAlertStatus(alertId, status, responderId);
        if (!alert) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Alert not found' }, null, 2),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(alert, null, 2),
            },
          ],
        };
      }

      case 'get_all_responders': {
        const responders = await getAllResponders();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(responders, null, 2),
            },
          ],
        };
      }

      case 'get_responder_details': {
        const responderId = args.responderId as string;
        if (!responderId) {
          throw new Error('responderId is required');
        }
        const responder = await getResponderById(responderId);
        if (!responder) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Responder not found' }, null, 2),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(responder, null, 2),
            },
          ],
        };
      }

      case 'get_responder_chats': {
        const responderId = args.responderId as string;
        if (!responderId) {
          throw new Error('responderId is required');
        }
        const chats = await getActiveChats(responderId);
        // Remove user_phone, only return user_display_name
        const safeChats = chats.map((chat: any) => {
          const { user_phone, ...safeChat } = chat;
          return {
            ...safeChat,
            user_display_name: chat.user_display_name,
            user_id: chat.user_id
          };
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(safeChats, null, 2),
            },
          ],
        };
      }

      case 'update_responder_availability': {
        const responderId = args.responderId as string;
        const isAvailable = args.isAvailable as boolean;
        if (!responderId || typeof isAvailable !== 'boolean') {
          throw new Error('responderId and isAvailable (boolean) are required');
        }
        const responder = await updateResponderAvailability(responderId, isAvailable);
        if (!responder) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Responder not found' }, null, 2),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(responder, null, 2),
            },
          ],
        };
      }

      case 'get_user_chats': {
        let user;
        if (args.phone) {
          user = await getUserByPhone(args.phone as string);
        } else if (args.userId) {
          user = await getUserById(args.userId as string);
        } else {
          throw new Error('Either phone or userId must be provided');
        }

        if (!user) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'User not found' }, null, 2),
              },
            ],
          };
        }

        const chats = await getUserChats(user.id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(chats, null, 2),
            },
          ],
        };
      }

      case 'get_chat_details': {
        const chatId = args.chatId as string;
        if (!chatId) {
          throw new Error('chatId is required');
        }
        const chat = await getChatById(chatId);
        if (!chat) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Chat not found' }, null, 2),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(chat, null, 2),
            },
          ],
        };
      }

      case 'get_user_statistics': {
        let user;
        if (args.phone) {
          user = await getUserByPhone(args.phone as string);
        } else if (args.userId) {
          user = await getUserById(args.userId as string);
        } else {
          throw new Error('Either phone or userId must be provided');
        }

        if (!user) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'User not found' }, null, 2),
              },
            ],
          };
        }

        const stats = await getUserStats(user.id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }

      case 'get_system_statistics': {
        const stats = await getSystemStats();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }

      case 'generate_ai_response': {
        const userMessage = args.userMessage as string;
        const userPhone = args.userPhone as string;
        const recentMoods = args.recentMoods as string[] | undefined;
        const moodTrend = args.moodTrend as any;
        const sentiment = args.sentiment as 'positive' | 'negative' | 'neutral' | undefined;

        if (!userMessage || !userPhone) {
          throw new Error('userMessage and userPhone are required');
        }

        // Get user context if available
        let recentJournalEntries: Array<{ content: string; sentiment: string }> | undefined;
        try {
          const user = await getUserByPhone(userPhone);
          if (user) {
            const entries = await getJournalEntries(user.id, 5);
            recentJournalEntries = entries.map((e: any) => ({
              content: e.content,
              sentiment: e.sentiment || 'neutral',
            }));
          }
        } catch (error) {
          // Continue without journal entries if error
        }

        const response = await generateAIResponse({
          userMessage,
          userPhone,
          recentMoods,
          recentJournalEntries,
          moodTrend,
          sentiment,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ response, context: { sentiment, moodTrend } }, null, 2),
            },
          ],
        };
      }

      case 'send_message_to_user': {
        const phone = args.phone as string;
        const message = args.message as string;
        const chatId = args.chatId as string | undefined;

        if (!phone || !message) {
          throw new Error('phone and message are required');
        }

        // ✅ VALIDATION: Only send to users registered in our database
        const { getUserByPhone } = await import('../db/queries.js');
        const user = await getUserByPhone(phone);
        
        if (!user) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    error: `Phone number ${phone} not found in database. Only users registered in our database can receive messages.`,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        try {
          if (chatId) {
            const chatIdNum = parseInt(chatId);
            await seriesClient.sendTextMessage(chatIdNum, message);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      message: 'Message sent successfully',
                      chatId: chatIdNum,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } else {
            // Find or create chat
            let chat = await seriesClient.findChat(phone);
            if (!chat) {
              chat = await seriesClient.createChatWithMessage([phone], message, 'Emotional Support');
            } else {
              await seriesClient.sendTextMessage(chat.id, message);
            }
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      message: 'Message sent successfully',
                      chatId: chat.id,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
        } catch (error: any) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: 'Failed to send message',
                    details: error.message,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }

      case 'process_and_respond': {
        const userMessage = args.userMessage as string;
        const userPhone = args.userPhone as string;
        const chatId = args.chatId as string | undefined;

        if (!userMessage || !userPhone) {
          throw new Error('userMessage and userPhone are required');
        }

        try {
          // Get user and context
          const user = await getUserByPhone(userPhone);
          if (!user) {
            throw new Error('User not found');
          }

          // Get recent moods and journal entries for context
          const checkins = await getLast7Checkins(user.id);
          const recentMoods = checkins.map((c: any) => c.mood);
          const moodTrend = analyzeMoodTrend(recentMoods);

          const journalEntries = await getJournalEntries(user.id, 5);
          const recentJournalEntries = journalEntries.map((e: any) => ({
            content: e.content,
            sentiment: e.sentiment || 'neutral',
          }));

          // Generate AI response
          const response = await processMessageAndRespond(
            userMessage,
            userPhone,
            recentMoods,
            recentJournalEntries,
            moodTrend
          );

          // Send message via Series API
          if (chatId) {
            const chatIdNum = parseInt(chatId);
            await seriesClient.sendTextMessage(chatIdNum, response);
          } else {
            let chat = await seriesClient.findChat(userPhone);
            if (!chat) {
              chat = await seriesClient.createChatWithMessage([userPhone], response, 'Emotional Support');
            } else {
              await seriesClient.sendTextMessage(chat.id, response);
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    message: 'Response generated and sent successfully',
                    response,
                    context: {
                      sentiment: analyzeSentiment(userMessage),
                      moodTrend,
                      hasCrisisKeywords: detectCrisisKeywords(userMessage),
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: 'Failed to process and respond',
                    details: error.message,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }

      case 'fetch_internet_resources': {
        const keywords = (args.keywords as string[]) || [];
        const location = args.location as string | undefined;
        const url = args.url as string | undefined;

        try {
          let resources;

          if (url) {
            // Fetch specific URL
            const resource = await fetchWebResource(url);
            resources = [resource];
          } else if (location) {
            // Get state-specific crisis resources
            resources = await getStateCrisisResources(location);
          } else {
            // Search for resources based on keywords
            resources = await searchMentalHealthResources(keywords, location);
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    resources: resources.map(r => ({
                      url: r.url,
                      title: r.title,
                      description: r.description,
                      links: r.links?.slice(0, 5), // Limit links
                    })),
                    formattedMessage: formatResourcesForMessage(resources),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: 'Failed to fetch resources',
                    details: error.message,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }

      case 'send_resource_to_user': {
        const phone = args.phone as string;
        const resources = args.resources as Array<{ url: string; title: string; description?: string }>;
        const message = args.message as string | undefined;
        const chatId = args.chatId as string | undefined;

        if (!phone || !resources || resources.length === 0) {
          throw new Error('phone and resources array are required');
        }

        try {
          // Format resources into a message
          let resourceMessage = message || 'Here are some helpful resources:\n\n';
          
          resources.forEach((resource, index) => {
            resourceMessage += `${index + 1}. ${resource.title}\n`;
            if (resource.description) {
              resourceMessage += `   ${resource.description}\n`;
            }
            resourceMessage += `   ${resource.url}\n\n`;
          });

          resourceMessage += '\nThese resources are here to support you.';

          // Send message via Series API
          if (chatId) {
            const chatIdNum = parseInt(chatId);
            await seriesClient.sendTextMessage(chatIdNum, resourceMessage);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      message: 'Resources sent successfully',
                      chatId: chatIdNum,
                      resourcesSent: resources.length,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } else {
            // Find or create chat
            let chat = await seriesClient.findChat(phone);
            if (!chat) {
              chat = await seriesClient.createChatWithMessage([phone], resourceMessage, 'Emotional Support');
            } else {
              await seriesClient.sendTextMessage(chat.id, resourceMessage);
            }
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      message: 'Resources sent successfully',
                      chatId: chat.id,
                      resourcesSent: resources.length,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
        } catch (error: any) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: 'Failed to send resources',
                    details: error.message,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error.message || 'Unknown error',
              tool: name,
              args,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

/**
 * Handle resource reads
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    switch (uri) {
      case 'emotional-support://stats': {
        const stats = await getSystemStats();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }

      case 'emotional-support://alerts/pending': {
        const alerts = await getPendingRiskAlerts();
        // Remove user_phone, only return user_display_name
        const safeAlerts = alerts.map((alert: any) => {
          const { user_phone, ...safeAlert } = alert;
          return {
            ...safeAlert,
            user_display_name: alert.user_display_name,
            user_id: alert.user_id
          };
        });
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(safeAlerts, null, 2),
            },
          ],
        };
      }

      case 'emotional-support://responders': {
        const responders = await getAllResponders();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(responders, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  } catch (error: any) {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: `Error: ${error.message}`,
        },
      ],
    };
  }
});

/**
 * Start MCP Server
 * MCP servers using StdioServerTransport must keep stdin open to stay alive
 */
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('✅ MCP Server started and ready');
    console.error('   Listening on stdin/stdout for MCP protocol messages');
    
    // Keep the process alive
    // StdioServerTransport uses stdin/stdout for communication
    // The process will stay alive as long as stdin is open
    process.stdin.resume();
    
    // ============================================================
    // OPTION B: Parent controls shutdown - MCP server is the child
    // ============================================================
    // DO NOT register SIGTERM/SIGINT handlers here!
    // The parent process (main server) controls shutdown by:
    // 1. Calling mcpClient.disconnect() 
    // 2. Which closes the transport
    // 3. Which closes stdin to this process
    // 4. We detect stdin closure and exit cleanly
    // ============================================================
    
    // Handle stdin closure (parent disconnected = time to shutdown)
    process.stdin.on('end', async () => {
      console.error('⚡ Parent disconnected stdin - MCP server shutting down');
      try {
        await server.close();
        console.error('✅ MCP server cleanup complete');
      } catch (error) {
        console.error('❌ Error during MCP cleanup:', error);
      }
      process.exit(0);
    });
    
    process.stdin.on('close', async () => {
      console.error('⚡ stdin closed - MCP server exiting');
      process.exit(0);
    });
    
    // Handle errors (log but don't exit - let parent control lifecycle)
    process.stdin.on('error', (error) => {
      console.error('❌ stdin error:', error);
    });
    
    process.stdout.on('error', (error) => {
      console.error('❌ stdout error:', error);
    });
    
    // Handle uncaught errors - log but keep running
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught exception in MCP server:', error);
      console.error('   Stack:', error.stack);
      // Don't exit - let parent control shutdown
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled rejection in MCP server:', reason);
      // Don't exit - let parent control shutdown
    });
    
  } catch (error: any) {
    console.error('❌ Fatal error in MCP server:', error);
    if (error.stack) {
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

main();


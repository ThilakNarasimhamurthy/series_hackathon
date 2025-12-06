# MCP Server Setup for Cursor

This guide explains how to configure the Emotional Support MCP Server to work with Cursor.

## What is the MCP Server?

The MCP (Model Context Protocol) server exposes backend capabilities to AI assistants like Cursor, allowing them to:
- Access user data and check-ins
- Analyze mood trends and sentiment
- Detect crisis keywords
- Manage responders and alerts
- Generate AI-powered responses
- And more...

## Configuration for Cursor

To use this MCP server with Cursor, you need to add it to Cursor's MCP settings.

### Option 1: Using Compiled Server (Recommended)

Add this to your Cursor MCP configuration (usually in `~/.cursor/mcp.json` or Cursor settings):

```json
{
  "mcpServers": {
    "emotional-support": {
      "command": "node",
      "args": [
        "/Users/karandavda/Desktop/series-hackathons/series_hackathon/backend/dist/mcp/server.js"
      ],
      "env": {
        "DATABASE_URL": "your-database-url",
        "SERIES_API_KEY": "your-series-api-key",
        "SERIES_API_BASE_URL": "https://api.series.dev",
        "SERIES_SENDER_NUMBER": "+16463458837",
        "OPENAI_API_KEY": "your-openai-api-key",
        "OPENAI_MODEL": "gpt-4o-mini"
      }
    }
  }
}
```

### Option 2: Using TypeScript Source (with tsx)

If you prefer to run the TypeScript source directly:

```json
{
  "mcpServers": {
    "emotional-support": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/Users/karandavda/Desktop/series-hackathons/series_hackathon/backend/src/mcp/server.ts"
      ],
      "env": {
        "DATABASE_URL": "your-database-url",
        "SERIES_API_KEY": "your-series-api-key",
        "SERIES_API_BASE_URL": "https://api.series.dev",
        "SERIES_SENDER_NUMBER": "+16463458837",
        "OPENAI_API_KEY": "your-openai-api-key",
        "OPENAI_MODEL": "gpt-4o-mini"
      }
    }
  }
}
```

### Option 3: Using npm script

You can also use the npm script, but you'll need to set the working directory:

```json
{
  "mcpServers": {
    "emotional-support": {
      "command": "npm",
      "args": [
        "run",
        "mcp:server"
      ],
      "cwd": "/Users/karandavda/Desktop/series-hackathons/series_hackathon/backend",
      "env": {
        "DATABASE_URL": "your-database-url",
        "SERIES_API_KEY": "your-series-api-key",
        "SERIES_API_BASE_URL": "https://api.series.dev",
        "SERIES_SENDER_NUMBER": "+16463458837",
        "OPENAI_API_KEY": "your-openai-api-key",
        "OPENAI_MODEL": "gpt-4o-mini"
      }
    }
  }
}
```

## Environment Variables

Make sure to set these environment variables in the MCP configuration:

- `DATABASE_URL`: Your Neon PostgreSQL connection string
- `SERIES_API_KEY`: Your Series API key
- `SERIES_API_BASE_URL`: Series API base URL (default: `https://api.series.dev`)
- `SERIES_SENDER_NUMBER`: Your Series sender phone number
- `OPENAI_API_KEY`: Your OpenAI API key (for AI features)
- `OPENAI_MODEL`: OpenAI model to use (default: `gpt-4o-mini`)

## Testing the MCP Server

You can test the MCP server using the test script:

```bash
cd backend
npm run mcp:test
```

This will:
1. Connect to the MCP server
2. List available tools
3. List available resources
4. Test various tools (sentiment analysis, etc.)

## Available Tools

The MCP server provides these tools:

- `get_user_data` - Get user data by phone or ID
- `get_user_checkins` - Get user mood check-ins
- `get_user_journal` - Get user journal entries
- `get_user_stats` - Get user statistics
- `analyze_sentiment` - Analyze text sentiment
- `detect_crisis_keywords` - Detect crisis keywords in text
- `analyze_mood_trend` - Analyze mood trends
- `get_ai_recommendation` - Get AI recommendations
- `get_pending_alerts` - Get pending risk alerts
- `get_responders` - Get all responders
- `get_responder_chats` - Get responder's active chats
- `update_responder_availability` - Update responder availability
- `update_alert_status` - Update risk alert status
- `search_mental_health_resources` - Search mental health resources
- `get_state_crisis_resources` - Get state-specific crisis resources

## Troubleshooting

### Server exits immediately
This is normal when running directly in a terminal. The MCP server is designed to be spawned by an MCP client (like Cursor) which maintains the stdio connection.

### Connection errors
- Make sure all environment variables are set correctly
- Verify the database connection string is valid
- Check that the server path is correct

### Tools not available
- Ensure the database is initialized (`npm run db:init`)
- Check that all dependencies are installed (`npm install`)

## Notes

- The MCP server uses stdio (standard input/output) for communication
- It must be spawned by an MCP client to maintain the connection
- The server will automatically shut down when stdin closes
- All errors are logged to stderr (console.error)


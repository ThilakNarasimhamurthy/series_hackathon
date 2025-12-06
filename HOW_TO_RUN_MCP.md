# How to Run the MCP Server

The MCP (Model Context Protocol) server can be run in different ways depending on your use case.

## Option 1: Test the MCP Server (Recommended for Testing)

Test the server to verify it's working correctly:

```bash
cd backend
npm run mcp:test
```

This will:
- Start the MCP server
- Connect to it as a client
- Test available tools and resources
- Show you what capabilities are available

**Use this when:** You want to verify the server is working or see what tools are available.

---

## Option 2: Run Directly (For Development/Debugging)

Run the server directly (note: it will exit when stdin closes, which is normal):

```bash
cd backend
npm run mcp:server
```

**Note:** This will start the server but it will exit immediately because it uses stdio (standard input/output) for communication. This is expected behavior - the server is designed to be spawned by MCP clients, not run directly in a terminal.

**Use this when:** You're debugging or want to see the server startup messages.

---

## Option 3: Use with Cursor (Recommended for Production)

The MCP server is designed to be used with Cursor's AI assistant. To use it:

### Step 1: Configure in Cursor

1. Open Cursor Settings
2. Go to **MCP (Model Context Protocol)** settings
3. Add a new MCP server configuration

### Step 2: Use this configuration:

**Using compiled server (recommended):**
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

**Or using TypeScript source:**
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

### Step 3: Restart Cursor

After adding the configuration, restart Cursor. The MCP server will be automatically spawned when Cursor needs to use it.

**Use this when:** You want to use the MCP server with Cursor's AI assistant to access backend capabilities.

---

## Option 4: Run as Part of Main Backend Server

The MCP server can also be started automatically when the main backend server starts. This happens if:
- `OPENAI_API_KEY` is set in your `.env` file
- The main server calls `startMCPWithClient()` (which it does automatically)

To run the main server with MCP:

```bash
cd backend
npm start
# or for development:
npm run dev
```

The MCP server will be started as a client connection (not a standalone server) and will be available to the backend for AI features.

**Use this when:** You want the backend to use MCP capabilities internally.

---

## Quick Reference

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `npm run mcp:test` | Test the MCP server | Testing/verification |
| `npm run mcp:server` | Run server directly | Development/debugging |
| Configure in Cursor | Use with Cursor AI | Production use with Cursor |
| `npm start` | Run main server (includes MCP client) | Full backend with MCP |

---

## Troubleshooting

### Server exits immediately
**This is normal!** The MCP server uses stdio transport and is designed to be spawned by MCP clients. When run directly, it exits when stdin closes. This is expected behavior.

### "Cannot find module" errors
Make sure you've built the project:
```bash
cd backend
npm run build
```

### Environment variables not set
Make sure your `.env` file in the `backend/` directory has all required variables:
- `DATABASE_URL`
- `SERIES_API_KEY`
- `OPENAI_API_KEY` (optional, for AI features)

### Server not connecting in Cursor
- Check that the path in the configuration is correct
- Verify all environment variables are set
- Check Cursor's MCP logs for errors
- Make sure you've restarted Cursor after configuration

---

## What the MCP Server Provides

Once running, the MCP server exposes these capabilities:

**Tools (23 available):**
- User data retrieval
- Mood check-ins
- Journal entries
- Sentiment analysis
- Crisis detection
- Mood trend analysis
- AI recommendations
- Responder management
- Alert management
- Mental health resources
- And more...

**Resources (4 available):**
- Users list
- Responders list
- Pending alerts
- System statistics

See `MCP_CURSOR_SETUP.md` for more details on available tools and resources.


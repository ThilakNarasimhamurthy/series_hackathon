# Backend-Frontend Connection Setup

## ✅ Connection Status

The backend and frontend are now connected and configured to communicate.

## Configuration

### Backend (Port 3000)
- **CORS Enabled**: Allows requests from `http://localhost:3001`
- **API Base URL**: `http://localhost:3000`
- **Health Check**: `http://localhost:3000/health`

### Frontend (Port 3001)
- **API Client**: `src/lib/api.ts`
- **API Base URL**: `http://localhost:3000` (configurable via `NEXT_PUBLIC_API_URL`)
- **Environment**: Create `.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:3000` if needed

## API Integration

### Connected Components

1. **CallbackForm** (`src/components/landing/CallbackForm.tsx`)
   - Calls `/api/send-welcome` endpoint
   - Sends welcome message to user's phone number

2. **UnifiedSidebar** (`src/components/responder/UnifiedSidebar.tsx`)
   - Fetches pending alerts from `/api/alerts/pending`
   - Fetches responder chats from `/api/responder/:id/chats`
   - Auto-refreshes every 30 seconds
   - Handles alert acceptance

### Available API Endpoints

All endpoints are accessible via `apiClient` from `@/lib/api`:

```typescript
import { apiClient } from '@/lib/api'

// Send welcome message
await apiClient.sendWelcome(phoneNumber)

// Get pending alerts
await apiClient.getPendingAlerts()

// Get responder chats
await apiClient.getResponderChats(responderId)

// Get user data
await apiClient.getUser(phone)

// Update alert status
await apiClient.updateAlertStatus(alertId, status, responderId)

// And more...
```

## Testing the Connection

1. **Test Backend Health**:
   ```bash
   curl http://localhost:3000/health
   ```

2. **Test CORS**:
   ```bash
   curl -X OPTIONS http://localhost:3000/api/send-welcome \
     -H "Origin: http://localhost:3001" \
     -H "Access-Control-Request-Method: POST"
   ```

3. **Test from Frontend**:
   - Open `http://localhost:3001`
   - Enter a phone number in the callback form
   - Check browser console for API calls

## Environment Variables

### Backend (.env)
```bash
PORT=3000
FRONTEND_URL=http://localhost:3001  # Optional, defaults to localhost:3001
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Next Steps

1. ✅ CORS configured
2. ✅ API client created
3. ✅ CallbackForm connected
4. ✅ UnifiedSidebar connected
5. ⏳ ChatInterface - needs to fetch chat messages
6. ⏳ Real-time updates - consider WebSockets or polling

## Notes

- Backend automatically restarts on file changes (tsx watch)
- Frontend hot-reloads on file changes (Next.js dev)
- API calls are rate-limited on the backend
- All API errors are handled gracefully in the frontend


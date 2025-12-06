/**
 * API Client for Backend Communication
 */

// Backend should run on port 3001 to avoid conflict with Next.js (port 3000)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retries: number = 2
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, config);
        
        if (!response.ok) {
          // Try to get error details from response
          let errorData: any;
          try {
            errorData = await response.json();
          } catch {
            errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
          }
          
          // Handle phone number not whitelisted as a special case (partial success)
          // User account is created, but message can't be sent yet
          if (response.status === 403 && 
              (errorData.message?.includes('Phone number not whitelisted') ||
               errorData.message?.includes('phone number not allowed') ||
               errorData.error?.includes('Phone number not whitelisted'))) {
            // Return a success-like response with warning
            return {
              success: true,
              message: errorData.message || 'Account created',
              warning: true,
              user_created: errorData.user_created || true,
              suggestion: errorData.suggestion,
              phone_number: errorData.phone_number
            } as T;
          }
          
          // Handle rate limit errors specifically
          if (response.status === 429) {
            const rateLimitError = new Error(errorData.error || errorData.message || 'Too many requests');
            (rateLimitError as any).status = 429;
            (rateLimitError as any).retryAfter = errorData.retryAfter;
            throw rateLimitError;
          }
          
          // Extract error message from various possible fields
          // Prioritize 'message' field as it often contains user-friendly messages
          const errorMessage = errorData.message || 
                              errorData.error || 
                              errorData.details || 
                              `Request failed with status ${response.status}`;
          
          const error = new Error(errorMessage);
          // Attach status code for specific error handling
          (error as any).status = response.status;
          (error as any).data = errorData;
          throw error;
        }

        return await response.json();
      } catch (error) {
        const isLastAttempt = attempt === retries;
        const isConnectionError = error instanceof TypeError && 
          (error.message === 'Failed to fetch' || 
           error.message.includes('fetch') || 
           error.message.includes('NetworkError') ||
           error.message.includes('Network request failed'));
        
        if (isConnectionError && !isLastAttempt) {
          // Retry connection errors with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          console.warn(`⚠️  Connection error, retrying in ${delay}ms... (attempt ${attempt + 1}/${retries + 1})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        if (error instanceof Error) {
          // Provide more helpful error messages
          if (isConnectionError) {
            const errorMsg = `Cannot connect to backend server at ${this.baseUrl}. ` +
              `Please ensure:\n` +
              `1. Backend server is running (cd backend && npm run dev)\n` +
              `2. Backend is running on port 3001\n` +
              `3. Check browser console for CORS errors\n` +
              `4. Try accessing ${this.baseUrl}/health in your browser`;
            throw new Error(errorMsg);
          }
          throw error;
        }
        throw new Error('Network error: Unable to connect to the server');
      }
    }
    
    // This should never be reached, but TypeScript needs it
    throw new Error('Request failed after retries');
  }

  // Health check
  async healthCheck() {
    return this.request('/health');
  }

  // Send welcome message to user
  async sendWelcome(phoneNumber: string) {
    return this.request<{ success: boolean; message: string; chat_id?: string; phone_number?: string }>(
      '/api/send-welcome',
      {
        method: 'POST',
        body: JSON.stringify({ phone_number: phoneNumber }),
      }
    );
  }

  // Get user data
  async getUser(phone: string) {
    return this.request(`/api/user/${encodeURIComponent(phone)}`);
  }

  // Get pending alerts for a responder
  // Responders can ONLY see alerts assigned to them (responder_id must match)
  async getPendingAlerts(responderId?: string) {
    const url = responderId 
      ? `/api/alerts/pending?responder_id=${encodeURIComponent(responderId)}`
      : '/api/alerts/pending';
    const response = await this.request<{ success: boolean; alerts: any[] }>(url);
    return response.alerts || [];
  }

  // Get responder chats
  async getResponderChats(responderId: string) {
    const response = await this.request<{ success: boolean; chats: any[] }>(`/api/responder/${responderId}/chats`);
    return response.chats || [];
  }

  // Get all responders
  async getAllResponders() {
    return this.request('/api/responders');
  }

  // Update responder availability
  async updateResponderAvailability(responderId: string, isAvailable: boolean) {
    return this.request(
      `/api/responder/${responderId}/availability`,
      {
        method: 'PATCH',
        body: JSON.stringify({ is_available: isAvailable }),
      }
    );
  }

  // Get chat by ID
  async getChat(chatId: string) {
    return this.request(`/api/chat/${chatId}`);
  }

  // Get alert by ID
  async getAlert(alertId: string) {
    return this.request(`/api/alert/${alertId}`);
  }

  // Update alert status
  async updateAlertStatus(alertId: string, status: string, responderId?: string) {
    return this.request(
      `/api/alert/${alertId}/status`,
      {
        method: 'PUT',
        body: JSON.stringify({ status, responder_id: responderId }),
      }
    );
  }

  // Accept/claim a crisis alert (creates chat and assigns responder)
  async acceptAlert(alertId: string, responderId: string) {
    return this.request<{ success: boolean; message: string; alert: any; chat: any }>(
      `/api/alert/${alertId}/accept`,
      {
        method: 'POST',
        body: JSON.stringify({ responder_id: responderId }),
      }
    );
  }

  // Get user check-ins
  async getUserCheckins(phone: string) {
    return this.request(`/api/user/${encodeURIComponent(phone)}/checkins`);
  }

  // Get system statistics
  async getSystemStats() {
    return this.request('/api/stats');
  }

  // Get chat with messages
  async getChatWithMessages(chatId: string) {
    try {
      const response = await this.request<{ success: boolean; chat: any; error?: string }>(`/api/chat/${chatId}`);
      // Handle error responses from backend
      if (response.error || !response.chat) {
        throw new Error(response.error || 'Chat not found');
      }
      return response.chat;
    } catch (error: any) {
      // Re-throw with better error message
      if (error.message) {
        throw error;
      }
      throw new Error('Failed to fetch chat');
    }
  }

  // Send message to chat
  async sendChatMessage(chatId: string, messageText: string) {
    return this.request<{ success: boolean; message: any }>(
      `/api/chat/${chatId}/message`,
      {
        method: 'POST',
        body: JSON.stringify({ message_text: messageText }),
      }
    );
  }

  // Update chat status
  async updateChatStatus(chatId: string, status: string) {
    try {
      return await this.request<{ success: boolean; chat: any }>(
        `/api/chat/${chatId}/status`,
        {
          method: 'PUT',
          body: JSON.stringify({ status }),
        }
      );
    } catch (error: any) {
      // Log full error for debugging
      console.error('Error updating chat status:', {
        status: error.status,
        message: error.message,
        data: error.data,
        fullError: error
      });
      
      // Provide more specific error messages
      if (error.status === 404) {
        throw new Error('Chat not found. It may have been deleted or archived.');
      } else if (error.status === 400) {
        const errorMsg = error.data?.error || error.message || 'Invalid status. Please use: active, ended, or archived.';
        throw new Error(errorMsg);
      } else if (error.status === 500) {
        // Try to extract error message from various possible locations
        const errorMessage = error.data?.details || 
                           error.data?.error || 
                           error.message || 
                           'Server error while updating chat status. Please try again.';
        throw new Error(errorMessage);
      }
      // For any other error, use the error message or a generic one
      throw new Error(error.message || 'Failed to update chat status. Please try again.');
    }
  }
}

export const apiClient = new ApiClient();
export default apiClient;


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
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        // Handle rate limit errors specifically
        if (response.status === 429) {
          const errorData = await response.json().catch(() => ({ error: 'Too many requests' }));
          const rateLimitError = new Error(errorData.error || errorData.message || 'Too many requests');
          (rateLimitError as any).status = 429;
          (rateLimitError as any).retryAfter = errorData.retryAfter;
          throw rateLimitError;
        }
        
        // Try to get error details from response
        let errorData: any;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        
        // Extract error message from various possible fields
        const errorMessage = errorData.error || 
                            errorData.message || 
                            errorData.details || 
                            `Request failed with status ${response.status}`;
        
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        // Provide more helpful error messages
        if (error.message === 'Failed to fetch' || error.message.includes('fetch')) {
          throw new Error(
            `Cannot connect to backend server at ${url}. ` +
            `Please ensure the backend is running on ${this.baseUrl} and CORS is configured correctly.`
          );
        }
        throw error;
      }
      throw new Error('Network error: Unable to connect to the server');
    }
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
      `/api/alert/${alertId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, responder_id: responderId }),
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
    return this.request(
      `/api/chat/${chatId}/status`,
      {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }
    );
  }
}

export const apiClient = new ApiClient();
export default apiClient;


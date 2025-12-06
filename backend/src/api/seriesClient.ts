import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Types for Series API (based on actual API documentation)
export interface CreateChatRequest {
  send_from: string; // E.164 phone number
  chat: {
    phone_numbers: string[]; // E.164 phone numbers
    display_name?: string | null;
  };
  message: {
    text: string; // Required, cannot be empty
  };
}

export interface ChatResponse {
  id: number; // Integer chat ID
  phone_numbers?: string[];
  display_name?: string | null;
  [key: string]: any;
}

export interface SendMessageRequest {
  message: {
    text: string;
  };
  attachments?: Array<{
    filename: string;
    mime_type: string;
    data_base64: string;
  }>;
}

export interface MessageResponse {
  id: number;
  text: string;
  chat_id: number;
  sent_at: string;
  [key: string]: any;
}

export interface CheckAvailabilityRequest {
  phone_number: string; // E.164 format
}

export interface CheckAvailabilityResponse {
  available: boolean;
  [key: string]: any;
}

// Series API Client Class
class SeriesAPIClient {
  private client: AxiosInstance;
  private baseURL: string;
  private apiKey: string;
  private senderNumber: string;

  constructor() {
    this.baseURL = process.env.SERIES_API_BASE_URL || 'https://api.series.dev';
    this.apiKey = process.env.SERIES_API_KEY || '';
    this.senderNumber = process.env.SERIES_SENDER_NUMBER || '+16463458837';

    if (!this.apiKey) {
      console.warn('⚠️  SERIES_API_KEY not set in environment variables');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 second timeout
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // Sanitize error to prevent API key exposure
        const sanitizedError: any = {
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
          url: error.config?.url,
        };
        
        // Only include safe data (no API keys or sensitive info)
        if (error.response?.data) {
          const safeData = { ...error.response.data };
          // Remove any potential sensitive fields
          delete safeData.api_key;
          delete safeData.apiKey;
          delete safeData.token;
          delete safeData.authorization;
          sanitizedError.data = safeData;
        }
        
        console.error('❌ Series API Error:', sanitizedError);
        throw error;
      }
    );
  }

  /**
   * Create a new chat and send initial message
   */
  async createChat(request: CreateChatRequest): Promise<ChatResponse> {
    try {
      const response = await this.client.post<any>('/api/chats', request);
      
      // API returns: { data: { id: ..., ... } }
      // So we need to extract from response.data.data
      const chatData = response.data.data || response.data;
      
      console.log('✅ Chat created - ID:', chatData.id);
      
      return chatData as ChatResponse;
    } catch (error) {
      console.error('❌ Failed to create chat:', error);
      if ((error as any).response) {
        console.error('   Response data:', JSON.stringify((error as any).response.data, null, 2));
      }
      throw error;
    }
  }

  private lastApiCallTime: number = 0;

  /**
   * Throttle API calls to prevent flooding
   */
  private async throttleApiCall<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const MIN_API_INTERVAL = 500; // 500ms minimum between API calls
    const timeSinceLastCall = now - (this.lastApiCallTime || 0);
    
    if (timeSinceLastCall < MIN_API_INTERVAL) {
      const delay = MIN_API_INTERVAL - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastApiCallTime = Date.now();
    return fn();
  }

  /**
   * Create chat with phone number(s) and send message
   * Helper method that uses sender number from env
   */
  async createChatWithMessage(phoneNumbers: string[], messageText: string, displayName?: string): Promise<ChatResponse> {
    return this.throttleApiCall(async () => {
      const request: CreateChatRequest = {
        send_from: this.senderNumber,
        chat: {
          phone_numbers: phoneNumbers,
          display_name: displayName || null,
        },
        message: {
          text: messageText,
        },
      };
      return this.createChat(request);
    });
  }

  /**
   * Send a message to an existing chat
   */
  async sendMessage(chatId: number, request: SendMessageRequest): Promise<MessageResponse> {
    try {
      const response = await this.client.post<any>(
        `/api/chats/${chatId}/chat_messages`,
        request
      );
      
      // API might wrap response in data property
      const messageData = response.data.data || response.data;
      
      console.log(`✅ Message sent to chat ${chatId}:`, messageData.id || 'success');
      return messageData as MessageResponse;
    } catch (error: any) {
      console.error(`❌ Failed to send message to chat ${chatId}:`, error.message);
      if (error.response) {
        console.error('   Response status:', error.response.status);
        console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Send text message to chat (helper method)
   */
  async sendTextMessage(chatId: number, text: string): Promise<MessageResponse> {
    return this.throttleApiCall(() => this.sendMessage(chatId, {
      message: { text }
    }));
  }

  /**
   * Get messages from a chat
   */
  async getChatMessages(chatId: number): Promise<MessageResponse[]> {
    try {
      const response = await this.client.get<any>(
        `/api/chats/${chatId}/chat_messages`
      );
      // Handle wrapped response
      const messages = Array.isArray(response.data) 
        ? response.data 
        : (response.data?.data || []);
      return messages as MessageResponse[];
    } catch (error) {
      console.error('❌ Failed to get chat messages:', error);
      throw error;
    }
  }

  /**
   * Get chat details
   */
  async getChat(chatId: number): Promise<ChatResponse> {
    try {
      const response = await this.client.get<ChatResponse>(`/api/chats/${chatId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to get chat:', error);
      throw error;
    }
  }

  /**
   * Find chat by phone numbers
   */
  async findChat(phoneNumber?: string, phoneNumbers?: string[]): Promise<ChatResponse | null> {
    try {
      const params: any = {};
      if (phoneNumber) params.phone_number = phoneNumber;
      if (phoneNumbers) params['phone_numbers[]'] = phoneNumbers;

      const response = await this.client.get<ChatResponse>('/api/chats/find', { params });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null; // Chat not found
      }
      console.error('❌ Failed to find chat:', error);
      throw error;
    }
  }

  /**
   * List chats (with optional phone filter)
   */
  async listChats(phoneNumber?: string, page: number = 1, perPage: number = 25): Promise<ChatResponse[]> {
    try {
      const params: any = { page, per_page: perPage };
      if (phoneNumber) params.phone_number = phoneNumber;

      const response = await this.client.get<{ data?: ChatResponse[] } | ChatResponse[]>(
        '/api/chats',
        { params }
      );
      
      // Handle paginated or direct array response
      return Array.isArray(response.data) ? response.data : (response.data as any).data || [];
    } catch (error) {
      console.error('❌ Failed to list chats:', error);
      throw error;
    }
  }

  /**
   * Check iMessage availability for a phone number
   */
  async checkIMessageAvailability(request: CheckAvailabilityRequest): Promise<CheckAvailabilityResponse> {
    try {
      const response = await this.client.post<CheckAvailabilityResponse>(
        '/api/i_message_availability/check',
        request
      );
      return response.data;
    } catch (error) {
      console.error('❌ Failed to check iMessage availability:', error);
      throw error;
    }
  }

  /**
   * Start typing indicator
   */
  async startTyping(chatId: number): Promise<void> {
    try {
      await this.client.post(`/api/chats/${chatId}/start_typing`);
      console.log('✅ Typing indicator started for chat:', chatId);
    } catch (error) {
      console.error('❌ Failed to start typing indicator:', error);
      throw error;
    }
  }

  /**
   * Stop typing indicator
   */
  async stopTyping(chatId: number): Promise<void> {
    try {
      await this.client.delete(`/api/chats/${chatId}/stop_typing`);
      console.log('✅ Typing indicator stopped for chat:', chatId);
    } catch (error) {
      console.error('❌ Failed to stop typing indicator:', error);
      throw error;
    }
  }

  /**
   * Mark chat as read
   */
  async markChatAsRead(chatId: number): Promise<void> {
    try {
      await this.client.put(`/api/chats/${chatId}/mark_as_read`);
      console.log('✅ Chat marked as read:', chatId);
    } catch (error) {
      console.error('❌ Failed to mark chat as read:', error);
      throw error;
    }
  }

  /**
   * Add reaction to message
   */
  async addReaction(messageId: number, type: 'love' | 'like' | 'dislike' | 'laugh' | 'emphasize' | 'question'): Promise<void> {
    try {
      await this.client.post(`/api/chat_messages/${messageId}/reactions`, {
        operation: 'add',
        type
      });
      console.log('✅ Reaction added to message:', messageId);
    } catch (error) {
      console.error('❌ Failed to add reaction:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const seriesClient = new SeriesAPIClient();

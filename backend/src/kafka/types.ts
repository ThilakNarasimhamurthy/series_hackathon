/**
 * Kafka Event Types - Based on actual Series API events
 */

// Base event structure from Series API
export interface SeriesKafkaEvent {
  api_version: string;
  created_at: string;
  data: Record<string, any>;
  event_id: string;
  event_type: string;
}

// Message received event
export interface MessageReceivedEvent extends SeriesKafkaEvent {
  event_type: 'message.received';
  data: {
    attachments: any[];
    chat_handles: Array<{
      display_name: string;
      identifier: string; // E.164 phone number
      is_me: boolean;
    }>;
    chat_id: string; // String representation of integer
    from_phone: string; // E.164 phone number
    id: string; // Message ID
    is_read: boolean;
    reaction_id: string | null;
    sent_at: string;
    service: string;
    text: string;
  };
}

// Typing indicator received
export interface TypingIndicatorReceivedEvent extends SeriesKafkaEvent {
  event_type: 'typing_indicator.received';
  data: {
    chat_handles: Array<{
      display_name: string;
      identifier: string;
      is_me: boolean;
    }>;
    chat_id: string;
    display: boolean;
    timestamp: string;
  };
}

// Typing indicator removed
export interface TypingIndicatorRemovedEvent extends SeriesKafkaEvent {
  event_type: 'typing_indicator.removed';
  data: {
    chat_handles: Array<{
      display_name: string;
      identifier: string;
      is_me: boolean;
    }>;
    chat_id: string;
    display: boolean;
    timestamp: string;
  };
}

// Legacy event types (for our internal processing)
export interface KafkaEvent {
  event_type: string;
  user_id?: string;
  timestamp: string;
  payload: Record<string, any>;
}

export interface MoodCheckinEvent extends KafkaEvent {
  event_type: 'mood_checkin';
  payload: {
    mood: string;
    tags?: string[];
    text?: string;
    phone?: string;
    chat_id?: string | number; // Series chat ID for replies
  };
}

export interface JournalEntryEvent extends KafkaEvent {
  event_type: 'journal_entry';
  payload: {
    content: string;
    source?: string;
    phone?: string;
    chat_id?: string | number; // Series chat ID for replies
  };
}

export interface HelpRequestEvent extends KafkaEvent {
  event_type: 'help_request';
  payload: {
    message: string;
    phone?: string;
    chat_id?: string | number; // Series chat ID for replies
  };
}

export interface CrisisSignalEvent extends KafkaEvent {
  event_type: 'crisis_signal';
  payload: {
    reason: string;
    content?: string;
    severity: 'low' | 'medium' | 'high';
    phone?: string;
    chat_id?: string | number; // Series chat ID for replies
  };
}

export type MentalHealthEvent = MoodCheckinEvent | JournalEntryEvent | HelpRequestEvent | CrisisSignalEvent;
export type SeriesEvent = MessageReceivedEvent | TypingIndicatorReceivedEvent | TypingIndicatorRemovedEvent;

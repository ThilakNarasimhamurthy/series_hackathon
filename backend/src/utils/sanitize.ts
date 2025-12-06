/**
 * Utility functions to sanitize data and prevent API key exposure
 */

/**
 * Remove sensitive fields from an object
 */
export function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sensitiveKeys = [
    'api_key',
    'apiKey',
    'api-key',
    'apikey',
    'token',
    'authorization',
    'auth',
    'password',
    'secret',
    'secret_key',
    'secretKey',
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'bearer',
    'SERIES_API_KEY',
    'OPENAI_API_KEY',
    'KAFKA_PASSWORD',
    'KAFKA_USERNAME',
  ];

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    
    // Skip sensitive keys
    if (sensitiveKeys.some(sensitive => keyLower.includes(sensitive.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Recursively sanitize nested objects
    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize error object to prevent API key exposure
 */
export function sanitizeError(error: any): {
  message: string;
  status?: number;
  code?: string;
  [key: string]: any;
} {
  const sanitized: any = {
    message: error?.message || 'Unknown error',
  };

  // Only include safe fields
  if (error?.response?.status) {
    sanitized.status = error.response.status;
  }

  if (error?.code) {
    sanitized.code = error.code;
  }

  // Sanitize response data if present
  if (error?.response?.data) {
    sanitized.data = sanitizeObject(error.response.data);
  }

  // Sanitize config if present (might contain headers with API keys)
  if (error?.config) {
    const safeConfig: any = {
      url: error.config.url,
      method: error.config.method,
    };
    // Don't include headers or other sensitive config
    sanitized.config = safeConfig;
  }

  return sanitized;
}

/**
 * Sanitize string to remove potential API keys
 */
export function sanitizeString(str: string): string {
  if (!str) return str;

  // Remove patterns that look like API keys
  const apiKeyPatterns = [
    /sk-[a-zA-Z0-9]{32,}/g, // OpenAI API keys
    /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, // UUIDs (might be API keys)
    /Bearer\s+[a-zA-Z0-9_-]{20,}/gi, // Bearer tokens
  ];

  let sanitized = str;
  for (const pattern of apiKeyPatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  return sanitized;
}

/**
 * Sanitize error message for logging
 */
export function sanitizeErrorMessage(error: any): string {
  if (!error) return 'Unknown error';

  let message = error.message || String(error);

  // Remove API key patterns
  message = sanitizeString(message);

  // Remove common sensitive terms
  const sensitiveTerms = ['api key', 'api_key', 'apikey', 'token', 'password', 'secret'];
  for (const term of sensitiveTerms) {
    if (message.toLowerCase().includes(term)) {
      return 'Internal server error';
    }
  }

  return message;
}

/**
 * Sanitize object for logging (removes sensitive fields)
 */
export function sanitizeForLogging(obj: any): any {
  if (!obj) return obj;
  
  return sanitizeObject(obj);
}


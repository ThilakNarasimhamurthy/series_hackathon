/**
 * Rate limiting middleware to prevent continuous API calls
 */

import { Request, Response, NextFunction } from 'express';

// Simple in-memory rate limiter
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Clean up old entries every 5 minutes
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupInterval) return; // Already started
  
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    Object.keys(store).forEach(key => {
      if (store[key].resetTime < now) {
        delete store[key];
      }
    });
  }, 5 * 60 * 1000);
}

function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// Start cleanup on module load
startCleanup();

// NOTE: Don't register SIGTERM/SIGINT handlers here
// The main server's gracefulShutdown() calls cleanupRateLimiter()
// Registering handlers here causes duplicate shutdown sequences

/**
 * Rate limiter middleware
 * @param windowMs Time window in milliseconds
 * @param max Maximum number of requests per window
 */
export function rateLimit(windowMs: number = 60000, max: number = 100) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    // Clean up expired entries
    if (store[key] && store[key].resetTime < now) {
      delete store[key];
    }
    
    // Initialize or get current count
    if (!store[key]) {
      store[key] = {
        count: 0,
        resetTime: now + windowMs,
      };
    }
    
    // Increment count
    store[key].count++;
    
    // Check if limit exceeded
    if (store[key].count > max) {
      const retryAfter = Math.ceil((store[key].resetTime - now) / 1000);
      res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
        retryAfter,
      });
      return;
    }
    
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - store[key].count));
    res.setHeader('X-RateLimit-Reset', new Date(store[key].resetTime).toISOString());
    
    next();
  };
}

/**
 * Strict rate limiter for sensitive endpoints (e.g., send-welcome)
 */
export function strictRateLimit(windowMs: number = 60000, max: number = 10) {
  return rateLimit(windowMs, max);
}

/**
 * Cleanup rate limiter (for graceful shutdown)
 */
export function cleanupRateLimiter() {
  stopCleanup();
}


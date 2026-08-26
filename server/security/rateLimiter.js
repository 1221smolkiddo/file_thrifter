// server/security/rateLimiter.js
// Lightweight in-memory rate limiter for THRIFT signaling server.
// Per-IP sliding window counters with automatic cleanup.

import logger from '../utils/logger.js';

class RateLimiter {
  constructor() {
    // Map<string, Map<string, { count: number, windowStart: number }>>
    // bucketName -> (clientKey -> { count, windowStart })
    this.buckets = new Map();

    // Cleanup stale entries every 60 seconds
    this._cleanupInterval = setInterval(() => this._cleanup(), 60_000);
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }
  }

  /**
   * Check if a request should be allowed.
   * @param {string} bucketName - Name of the rate limit bucket (e.g. 'CREATE_SESSION')
   * @param {string} clientKey - Identifier for the client (typically IP or socket ID)
   * @param {object} limits - { windowMs, maxRequests }
   * @returns {object} { allowed: boolean, remaining: number, retryAfterMs: number }
   */
  check(bucketName, clientKey, limits) {
    const { windowMs, maxRequests } = limits;
    const now = Date.now();

    if (!this.buckets.has(bucketName)) {
      this.buckets.set(bucketName, new Map());
    }

    const bucket = this.buckets.get(bucketName);
    const entry = bucket.get(clientKey);

    if (!entry || (now - entry.windowStart) >= windowMs) {
      // Window expired or first request — start fresh
      bucket.set(clientKey, { count: 1, windowStart: now });
      return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
    }

    if (entry.count >= maxRequests) {
      const retryAfterMs = windowMs - (now - entry.windowStart);
      logger.warn('RATE_LIMIT', `Rate limit exceeded: ${bucketName}`, {
        bucket: bucketName,
        retryAfterMs,
      });
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    entry.count++;
    return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: 0 };
  }

  /**
   * Record a failed attempt (e.g., invalid token) in a separate bucket.
   * This allows stricter limits on bad actors without affecting normal usage.
   */
  recordFailure(clientKey, limits) {
    return this.check('INVALID_ATTEMPT', clientKey, limits);
  }

  /**
   * Clean up expired window entries to prevent memory growth.
   */
  _cleanup() {
    const now = Date.now();
    for (const [bucketName, bucket] of this.buckets.entries()) {
      for (const [clientKey, entry] of bucket.entries()) {
        // Remove entries older than 2x their window to be safe
        if ((now - entry.windowStart) > 120_000) {
          bucket.delete(clientKey);
        }
      }
      if (bucket.size === 0) {
        this.buckets.delete(bucketName);
      }
    }
  }

  /**
   * Destroy the rate limiter (clears interval).
   */
  destroy() {
    clearInterval(this._cleanupInterval);
    this.buckets.clear();
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();
export default rateLimiter;
export { RateLimiter };

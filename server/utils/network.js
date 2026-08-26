// server/utils/network.js
// Networking & request parsing utilities for THRIFT server.

/**
 * Extract the real client IP, accounting for standard reverse proxy headers.
 * Supports x-forwarded-for, cf-connecting-ip, x-real-ip, and socket remote address.
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
export function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const rawIp = typeof forwarded === 'string' ? forwarded : forwarded[0];
    const clientIp = rawIp.split(',')[0].trim();
    if (clientIp) return clientIp;
  }
  return req.headers?.['cf-connecting-ip'] || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

/**
 * Validate incoming WebSocket origin against configured frontend origins.
 * Supports comma-separated origins, trailing slash normalization, and wildcards (*.vercel.app).
 * @param {string} origin
 * @param {string} configuredOrigin
 * @returns {boolean}
 */
export function isOriginAllowed(origin, configuredOrigin) {
  if (!configuredOrigin || configuredOrigin === '*') return true;
  if (!origin) return true;

  const allowedList = configuredOrigin.split(',').map((o) => o.trim().replace(/\/+$/, ''));
  const normOrigin = origin.trim().replace(/\/+$/, '');

  return allowedList.some((allowed) => {
    if (allowed === '*' || allowed === normOrigin) return true;
    if (allowed.includes('*')) {
      const regexPattern = '^' + allowed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
      return new RegExp(regexPattern).test(normOrigin);
    }
    return false;
  });
}

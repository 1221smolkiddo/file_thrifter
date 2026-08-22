// server/security/tokens.js
// Cryptographically secure token generation for THRIFT.
// Uses Node.js crypto module exclusively — never Math.random().

import crypto from 'crypto';

// Characters for human-readable display IDs (ambiguous chars excluded: O, 0, I, 1, L)
const DISPLAY_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DISPLAY_ID_LENGTH = 6;

/**
 * Generate a cryptographically secure display ID.
 * 6 characters from a 29-char alphabet ≈ ~24 bits of entropy.
 * This is a public identifier only — NOT a security credential.
 */
export function generateDisplayId() {
  const bytes = crypto.randomBytes(DISPLAY_ID_LENGTH);
  let result = '';
  for (let i = 0; i < DISPLAY_ID_LENGTH; i++) {
    result += DISPLAY_CHARS[bytes[i] % DISPLAY_CHARS.length];
  }
  return result;
}

/**
 * Generate a cryptographically secure session secret.
 * 256-bit (32-byte) random token, hex-encoded = 64 chars.
 * This is the actual security credential used for authorization.
 */
export function generateSessionSecret() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a session secret for safe storage.
 * We store the hash in-memory, never the raw secret.
 * Uses SHA-256 which is sufficient for this use case
 * (secrets already have 256 bits of entropy, no brute-force risk).
 */
export function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Verify a provided secret against a stored hash.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifySecret(providedSecret, storedHash) {
  const providedHash = hashSecret(providedSecret);
  const a = Buffer.from(providedHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

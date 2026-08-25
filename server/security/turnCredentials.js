// server/security/turnCredentials.js
// Generates time-limited HMAC-SHA1 credentials compatible with Coturn's
// `use_auth_secret` / `static-auth-secret` mode.
// Zero-cost: works with any self-hosted Coturn instance.

import crypto from 'crypto';

/**
 * Generate ephemeral TURN credentials.
 *
 * Coturn validates these by:
 *   1. Parsing the username as "timestamp:id"
 *   2. Checking timestamp > now (credential not expired)
 *   3. Computing HMAC-SHA1(username, sharedSecret) and comparing to credential
 *
 * @param {string} sharedSecret - The `static-auth-secret` configured in Coturn
 * @param {number} [ttlSeconds=21600] - Credential lifetime (default: 6 hours)
 * @returns {{ username: string, credential: string, ttlSeconds: number }}
 */
export function generateTurnCredentials(sharedSecret, ttlSeconds = 21600) {
  if (!sharedSecret || typeof sharedSecret !== 'string') {
    throw new Error('TURN shared secret is required');
  }

  const expiryTimestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const id = crypto.randomBytes(4).toString('hex');
  const username = `${expiryTimestamp}:${id}`;

  const hmac = crypto.createHmac('sha1', sharedSecret);
  hmac.update(username);
  const credential = hmac.digest('base64');

  return { username, credential, ttlSeconds };
}

/**
 * Build a complete ICE servers array with ephemeral TURN credentials.
 *
 * @param {object} config - Server config object
 * @returns {object[]} ICE server configuration for RTCPeerConnection
 */
export function buildIceServers(config) {
  // Always include free STUN servers
  const servers = config.STUN_SERVERS.map(url => ({ urls: url }));

  // If a TURN shared secret is configured, generate ephemeral credentials
  if (config.TURN_SHARED_SECRET && config.TURN_SERVERS.length > 0) {
    const { username, credential } = generateTurnCredentials(
      config.TURN_SHARED_SECRET,
      config.TURN_CREDENTIAL_TTL_S,
    );

    for (const url of config.TURN_SERVERS) {
      servers.push({ urls: url, username, credential });
    }
  } else if (config.TURN_SERVERS.length > 0 && config.TURN_USERNAME && config.TURN_CREDENTIAL) {
    // Fallback: static credentials (legacy mode)
    for (const url of config.TURN_SERVERS) {
      servers.push({
        urls: url,
        username: config.TURN_USERNAME,
        credential: config.TURN_CREDENTIAL,
      });
    }
  }

  return servers;
}

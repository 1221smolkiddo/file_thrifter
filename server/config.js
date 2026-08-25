// server/config.js
// Centralized configuration from environment variables with sensible defaults.

import { buildIceServers } from './security/turnCredentials.js';

const config = {
  // Server
  PORT: parseInt(process.env.PORT, 10) || 4000,

  // Frontend origin for CORS / WS origin checks
  // In development: http://localhost:5173
  // In production: set to the actual deployed frontend URL
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',

  // Lifetime for an unpaired QR session (default: 10 minutes)
  SESSION_TTL_MS: parseInt(process.env.SESSION_TTL_MS, 10) || 10 * 60 * 1000,

  // Once paired, end an inactive connection after five minutes. Transfers send
  // control-only keep-alives and therefore are never cut off by this timer.
  SESSION_IDLE_TIMEOUT_MS: parseInt(process.env.SESSION_IDLE_TIMEOUT_MS, 10) || 5 * 60 * 1000,

  // Session cleanup interval (how often we sweep for expired sessions)
  SESSION_CLEANUP_INTERVAL_MS: parseInt(process.env.SESSION_CLEANUP_INTERVAL_MS, 10) || 15_000,

  // WebSocket
  WS_MAX_MESSAGE_SIZE: parseInt(process.env.WS_MAX_MESSAGE_SIZE, 10) || 64 * 1024, // 64 KB
  WS_HEARTBEAT_INTERVAL_MS: parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS, 10) || 30_000,
  WS_PONG_TIMEOUT_MS: parseInt(process.env.WS_PONG_TIMEOUT_MS, 10) || 10_000,

  // Rate limiting
  RATE_LIMIT_CREATE_SESSION: {
    windowMs: parseInt(process.env.RL_CREATE_WINDOW_MS, 10) || 60_000,
    maxRequests: parseInt(process.env.RL_CREATE_MAX, 10) || 5,
  },
  RATE_LIMIT_JOIN_SESSION: {
    windowMs: parseInt(process.env.RL_JOIN_WINDOW_MS, 10) || 60_000,
    maxRequests: parseInt(process.env.RL_JOIN_MAX, 10) || 10,
  },
  RATE_LIMIT_INVALID_TOKEN: {
    windowMs: parseInt(process.env.RL_INVALID_TOKEN_WINDOW_MS, 10) || 60_000,
    maxRequests: parseInt(process.env.RL_INVALID_TOKEN_MAX, 10) || 5,
  },
  RATE_LIMIT_WS_CONNECT: {
    windowMs: parseInt(process.env.RL_WS_CONNECT_WINDOW_MS, 10) || 60_000,
    maxRequests: parseInt(process.env.RL_WS_CONNECT_MAX, 10) || 20,
  },
  RATE_LIMIT_SIGNALING: {
    windowMs: parseInt(process.env.RL_SIGNALING_WINDOW_MS, 10) || 10_000,
    maxRequests: parseInt(process.env.RL_SIGNALING_MAX, 10) || 50,
  },

  // ICE servers for WebRTC (provided to clients on connection)
  STUN_SERVERS: process.env.STUN_SERVERS
    ? process.env.STUN_SERVERS.split(',').map(s => s.trim())
    : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],

  TURN_SERVERS: process.env.TURN_SERVERS
    ? process.env.TURN_SERVERS.split(',').map(s => s.trim())
    : [],

  TURN_USERNAME: process.env.TURN_USERNAME || '',
  TURN_CREDENTIAL: process.env.TURN_CREDENTIAL || '',

  // Ephemeral TURN credentials (Coturn use_auth_secret mode)
  TURN_SHARED_SECRET: process.env.TURN_SHARED_SECRET || '',
  TURN_CREDENTIAL_TTL_S: parseInt(process.env.TURN_CREDENTIAL_TTL_S, 10) || 21600, // 6 hours

  // Reconnection grace period (how long to hold a session after disconnect)
  RECONNECT_GRACE_MS: parseInt(process.env.RECONNECT_GRACE_MS, 10) || 30_000, // 30 seconds

  // WebSocket relay fallback
  RELAY_MAX_BYTES_PER_SESSION: parseInt(process.env.RELAY_MAX_BYTES, 10) || 500 * 1024 * 1024, // 500 MB
  RELAY_CHUNK_SIZE: parseInt(process.env.RELAY_CHUNK_SIZE, 10) || 64 * 1024, // 64 KB
  RATE_LIMIT_RELAY: {
    windowMs: parseInt(process.env.RL_RELAY_WINDOW_MS, 10) || 1_000,
    maxRequests: parseInt(process.env.RL_RELAY_MAX, 10) || 100,
  },

  // Node environment
  NODE_ENV: process.env.NODE_ENV || 'development',
};

// Build ICE server config for clients (with ephemeral TURN credentials when configured)
config.getIceServers = () => buildIceServers(config);

export default config;

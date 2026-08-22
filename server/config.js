// server/config.js
// Centralized configuration from environment variables with sensible defaults.

const config = {
  // Server
  PORT: parseInt(process.env.PORT, 10) || 4000,

  // Frontend origin for CORS / WS origin checks
  // In development: http://localhost:5173
  // In production: set to the actual deployed frontend URL
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',

  // Session lifetime in milliseconds (default: 10 minutes)
  SESSION_TTL_MS: parseInt(process.env.SESSION_TTL_MS, 10) || 10 * 60 * 1000,

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

  // Node environment
  NODE_ENV: process.env.NODE_ENV || 'development',
};

// Build ICE server config for clients
config.getIceServers = () => {
  const servers = config.STUN_SERVERS.map(url => ({ urls: url }));

  if (config.TURN_SERVERS.length > 0 && config.TURN_USERNAME && config.TURN_CREDENTIAL) {
    for (const url of config.TURN_SERVERS) {
      servers.push({
        urls: url,
        username: config.TURN_USERNAME,
        credential: config.TURN_CREDENTIAL,
      });
    }
  }

  return servers;
};

export default config;

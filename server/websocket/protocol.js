// server/websocket/protocol.js
// WebSocket message types and validation for THRIFT signaling protocol.

/**
 * Client-to-server message types.
 */
export const CLIENT_MSG = {
  CREATE_SESSION: 'CREATE_SESSION',
  JOIN_SESSION: 'JOIN_SESSION',
  ACCEPT_CONNECTION: 'ACCEPT_CONNECTION',
  REJECT_CONNECTION: 'REJECT_CONNECTION',
  WEBRTC_SIGNAL: 'WEBRTC_SIGNAL',
  DISCONNECT: 'DISCONNECT',
  PING: 'PING',
  // Reconnection
  RECONNECT: 'RECONNECT',
  // Local discovery
  DISCOVER_LOCAL: 'DISCOVER_LOCAL',
  // Relay fallback
  RELAY_REQUEST: 'RELAY_REQUEST',
  RELAY_END: 'RELAY_END',
};

/**
 * Server-to-client message types.
 */
export const SERVER_MSG = {
  SESSION_CREATED: 'SESSION_CREATED',
  JOINING: 'JOINING',
  CONNECTION_REQUEST: 'CONNECTION_REQUEST',
  SESSION_CONNECTED: 'SESSION_CONNECTED',
  CONNECTION_REJECTED: 'CONNECTION_REJECTED',
  WEBRTC_SIGNAL: 'WEBRTC_SIGNAL',
  PEER_DISCONNECTED: 'PEER_DISCONNECTED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_TIMED_OUT: 'SESSION_TIMED_OUT',
  ERROR: 'ERROR',
  PONG: 'PONG',
  // Reconnection
  RECONNECT_TOKEN: 'RECONNECT_TOKEN',
  PEER_RECONNECTING: 'PEER_RECONNECTING',
  RECONNECTED: 'RECONNECTED',
  // Local discovery
  LOCAL_SESSIONS: 'LOCAL_SESSIONS',
  // Relay fallback
  RELAY_READY: 'RELAY_READY',
  RELAY_REJECTED: 'RELAY_REJECTED',
  RELAY_DATA: 'RELAY_DATA',
  RELAY_ENDED: 'RELAY_ENDED',
};

/**
 * Construct a structured error response.
 */
export function errorResponse(code, message) {
  return JSON.stringify({
    type: SERVER_MSG.ERROR,
    code,
    message,
  });
}

/**
 * Validate and parse an incoming WebSocket message.
 * Returns { valid: boolean, data?: object, error?: string }
 */
export function parseMessage(raw) {
  // Must be a string
  if (typeof raw !== 'string') {
    return { valid: false, error: 'Message must be a string' };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { valid: false, error: 'Invalid JSON' };
  }

  // Must be a plain object
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'Message must be a JSON object' };
  }

  // Must have a 'type' field
  if (typeof data.type !== 'string' || !data.type) {
    return { valid: false, error: 'Missing or invalid message type' };
  }

  // Validate type is a known client message type
  if (!Object.values(CLIENT_MSG).includes(data.type)) {
    return { valid: false, error: `Unknown message type: ${data.type}` };
  }

  // Type-specific validation
  switch (data.type) {
    case CLIENT_MSG.JOIN_SESSION: {
      if (typeof data.sessionId !== 'string' || !data.sessionId.trim()) {
        return { valid: false, error: 'JOIN_SESSION requires a sessionId' };
      }
      if (typeof data.token !== 'string' || !data.token.trim()) {
        return { valid: false, error: 'JOIN_SESSION requires a token' };
      }
      break;
    }

    case CLIENT_MSG.WEBRTC_SIGNAL: {
      if (!data.payload || typeof data.payload !== 'object') {
        return { valid: false, error: 'WEBRTC_SIGNAL requires a payload object' };
      }
      break;
    }

    case CLIENT_MSG.RECONNECT: {
      if (typeof data.reconnectToken !== 'string' || !data.reconnectToken.trim()) {
        return { valid: false, error: 'RECONNECT requires a reconnectToken' };
      }
      if (typeof data.sessionId !== 'string' || !data.sessionId.trim()) {
        return { valid: false, error: 'RECONNECT requires a sessionId' };
      }
      break;
    }
  }

  return { valid: true, data };
}

// server/websocket/connectionHandler.js
// WebSocket connection handler for THRIFT signaling server.
// Routes parsed messages to the SessionManager with rate limiting and authorization.

import crypto from 'crypto';
import { CLIENT_MSG, SERVER_MSG, parseMessage, errorResponse } from './protocol.js';
import config from '../config.js';
import rateLimiter from '../security/rateLimiter.js';
import logger from '../utils/logger.js';
import metrics from '../monitoring/metrics.js';

/**
 * Hash a client IP for privacy-preserving local discovery.
 * Uses SHA-256 — we never store or log raw IPs.
 * @param {string} ip
 * @returns {string}
 */
function hashIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

/**
 * Create a message handler for a WebSocket connection.
 * @param {WebSocket} ws - The WebSocket connection
 * @param {SessionManager} sessionManager - The session manager instance
 * @param {string} clientIp - The client's IP (for rate limiting)
 */
export function createConnectionHandler(ws, sessionManager, clientIp) {
  const ipHash = hashIp(clientIp);

  // Handle incoming messages
  ws.on('message', (rawMessage, isBinary) => {
    metrics.increment('ws_messages_total');

    // Binary messages are relay data — route directly without parsing
    if (isBinary) {
      handleRelayData(ws, sessionManager, clientIp, rawMessage);
      return;
    }

    // Enforce message size limit
    const messageBytes = typeof rawMessage === 'string'
      ? Buffer.byteLength(rawMessage, 'utf8')
      : rawMessage.length;

    if (messageBytes > config.WS_MAX_MESSAGE_SIZE) {
      ws.send(errorResponse('MESSAGE_TOO_LARGE', 'Message exceeds maximum allowed size.'));
      return;
    }

    // Parse and validate the message
    const messageStr = rawMessage.toString();
    const parsed = parseMessage(messageStr);

    if (!parsed.valid) {
      logger.warn('WS', 'Malformed message received', { error: parsed.error });
      ws.send(errorResponse('MALFORMED_MESSAGE', 'Invalid message format.'));
      return;
    }

    const { data } = parsed;

    try {
      switch (data.type) {
        case CLIENT_MSG.CREATE_SESSION:
          handleCreateSession(ws, sessionManager, clientIp, ipHash);
          break;

        case CLIENT_MSG.JOIN_SESSION:
          handleJoinSession(ws, sessionManager, clientIp, data);
          break;

        case CLIENT_MSG.ACCEPT_CONNECTION:
          handleAcceptConnection(ws, sessionManager);
          break;

        case CLIENT_MSG.REJECT_CONNECTION:
          handleRejectConnection(ws, sessionManager);
          break;

        case CLIENT_MSG.WEBRTC_SIGNAL:
          handleWebRtcSignal(ws, sessionManager, clientIp, data);
          break;

        case CLIENT_MSG.DISCONNECT:
          handleDisconnect(ws, sessionManager);
          break;

        case CLIENT_MSG.PING:
          sessionManager.touchSession(ws);
          ws.send(JSON.stringify({ type: SERVER_MSG.PONG }));
          break;

        // ─── Local Discovery ───
        case CLIENT_MSG.DISCOVER_LOCAL:
          handleDiscoverLocal(ws, sessionManager, clientIp, ipHash);
          break;

        // ─── Relay Fallback ───
        case CLIENT_MSG.RELAY_REQUEST:
          handleRelayRequest(ws, sessionManager);
          break;

        case CLIENT_MSG.RELAY_END:
          handleRelayEnd(ws, sessionManager);
          break;

        default:
          ws.send(errorResponse('UNKNOWN_TYPE', 'Unknown message type.'));
          break;
      }
    } catch (err) {
      logger.error('WS', 'Error handling message', { type: data.type, error: err.message });
      ws.send(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred.'));
    }
  });

  // Handle socket close
  ws.on('close', () => {
    sessionManager.handleDisconnect(ws);
  });

  // Handle socket error
  ws.on('error', (err) => {
    logger.error('WS', 'Socket error', { error: err.message });
    sessionManager.handleDisconnect(ws);
  });
}

// ─── Message Handlers ────────────────────────────────────────────

function handleCreateSession(ws, sessionManager, clientIp, ipHash) {
  // Rate limit
  const rl = rateLimiter.check('CREATE_SESSION', clientIp, config.RATE_LIMIT_CREATE_SESSION);
  if (!rl.allowed) {
    metrics.increment('rate_limit_hits');
    ws.send(errorResponse('RATE_LIMITED', 'Too many session creation attempts. Please wait.'));
    return;
  }

  // Check if this socket already owns a session
  const existing = sessionManager.getBinding(ws);
  if (existing) {
    ws.send(errorResponse('ALREADY_IN_SESSION', 'You are already in a session.'));
    return;
  }

  const { displayId, secret, expiresAt } = sessionManager.createSession(ws, ipHash);

  ws.send(JSON.stringify({
    type: SERVER_MSG.SESSION_CREATED,
    displayId,
    sessionToken: secret,
    expiresAt,
  }));
}

function handleJoinSession(ws, sessionManager, clientIp, data) {
  // Rate limit join attempts
  const rl = rateLimiter.check('JOIN_SESSION', clientIp, config.RATE_LIMIT_JOIN_SESSION);
  if (!rl.allowed) {
    metrics.increment('rate_limit_hits');
    ws.send(errorResponse('RATE_LIMITED', 'Too many join attempts. Please wait.'));
    return;
  }

  // Check if this socket is already in a session
  const existing = sessionManager.getBinding(ws);
  if (existing) {
    ws.send(errorResponse('ALREADY_IN_SESSION', 'You are already in a session.'));
    return;
  }

  const { sessionId, token } = data;

  const result = sessionManager.joinSession(sessionId, token, ws);

  if (!result.success) {
    // Track invalid token attempts for stricter rate limiting
    if (result.error === 'INVALID_TOKEN') {
      const failRl = rateLimiter.recordFailure(clientIp, config.RATE_LIMIT_INVALID_TOKEN);
      if (!failRl.allowed) {
        metrics.increment('rate_limit_hits');
        ws.send(errorResponse('RATE_LIMITED', 'Too many failed attempts. Please wait.'));
        return;
      }
    }

    ws.send(errorResponse(result.error, result.message));
    return;
  }

  // Notify the guest that they're joining (PAIRING state)
  ws.send(JSON.stringify({
    type: SERVER_MSG.JOINING,
    displayId: sessionId,
  }));
}

function handleAcceptConnection(ws, sessionManager) {
  const binding = sessionManager.getBinding(ws);
  if (!binding || binding.role !== 'host') {
    ws.send(errorResponse('UNAUTHORIZED', 'Only the session host can accept connections.'));
    return;
  }

  const success = sessionManager.acceptConnection(binding.displayId, ws);
  if (!success) {
    ws.send(errorResponse('ACCEPT_FAILED', 'No pending connection request to accept.'));
    return;
  }
  // On success, SessionManager sends SESSION_CONNECTED to both peers
}

function handleRejectConnection(ws, sessionManager) {
  const binding = sessionManager.getBinding(ws);
  if (!binding || binding.role !== 'host') {
    ws.send(errorResponse('UNAUTHORIZED', 'Only the session host can reject connections.'));
    return;
  }

  const success = sessionManager.rejectConnection(binding.displayId, ws);
  if (!success) {
    ws.send(errorResponse('REJECT_FAILED', 'No pending connection request to reject.'));
  }
}

function handleWebRtcSignal(ws, sessionManager, clientIp, data) {
  // Rate limit signaling messages
  const rl = rateLimiter.check('SIGNALING', clientIp, config.RATE_LIMIT_SIGNALING);
  if (!rl.allowed) {
    metrics.increment('rate_limit_hits');
    ws.send(errorResponse('RATE_LIMITED', 'Signaling rate limit exceeded.'));
    return;
  }

  // Authorization: must be in a session, and session must be CONNECTED
  const binding = sessionManager.getBinding(ws);
  if (!binding) {
    ws.send(errorResponse('UNAUTHORIZED', 'Not in an active session.'));
    return;
  }

  const success = sessionManager.routeSignal(ws, data.payload);
  if (!success) {
    ws.send(errorResponse('SIGNAL_FAILED', 'Unable to route signaling message.'));
  }
}

function handleDisconnect(ws, sessionManager) {
  sessionManager.handleDisconnect(ws);
  ws.close();
}

// ─── Local Discovery Handler ─────────────────────────────────────

function handleDiscoverLocal(ws, sessionManager, clientIp, ipHash) {
  // Rate limit discovery requests
  const rl = rateLimiter.check('DISCOVER', clientIp, config.RATE_LIMIT_CREATE_SESSION);
  if (!rl.allowed) {
    metrics.increment('rate_limit_hits');
    ws.send(errorResponse('RATE_LIMITED', 'Too many discovery requests. Please wait.'));
    return;
  }

  const sessions = sessionManager.discoverLocal(ipHash);

  ws.send(JSON.stringify({
    type: SERVER_MSG.LOCAL_SESSIONS,
    sessions, // Array of { displayId } — no tokens, no secrets
    count: sessions.length,
  }));
}

// ─── Relay Fallback Handlers ─────────────────────────────────────

function handleRelayRequest(ws, sessionManager) {
  const binding = sessionManager.getBinding(ws);
  if (!binding) {
    ws.send(errorResponse('UNAUTHORIZED', 'Not in an active session.'));
    return;
  }

  const result = sessionManager.activateRelay(ws);
  if (!result.success) {
    ws.send(JSON.stringify({ type: SERVER_MSG.RELAY_REJECTED, reason: result.error }));
  }
  // On success, SessionManager sends RELAY_READY to both peers
}

function handleRelayData(ws, sessionManager, clientIp, data) {
  // Rate limit relay data
  const rl = rateLimiter.check('RELAY_DATA', clientIp, config.RATE_LIMIT_RELAY);
  if (!rl.allowed) {
    metrics.increment('rate_limit_hits');
    // Don't send error for binary relay — just drop silently
    return;
  }

  const result = sessionManager.routeRelayData(ws, data);
  if (!result.success && result.error === 'Relay byte limit exceeded') {
    ws.send(JSON.stringify({ type: SERVER_MSG.RELAY_ENDED, reason: 'byte_limit' }));
  }
}

function handleRelayEnd(ws, sessionManager) {
  const binding = sessionManager.getBinding(ws);
  if (!binding) return;

  const session = sessionManager.getSession(binding.displayId);
  if (session && session.relayActive) {
    sessionManager.deactivateRelay(session);
  }
}

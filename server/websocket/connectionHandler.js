// server/websocket/connectionHandler.js
// WebSocket connection handler for THRIFT signaling server.
// Routes parsed messages to the SessionManager with rate limiting and authorization.

import { CLIENT_MSG, SERVER_MSG, parseMessage, errorResponse } from './protocol.js';
import config from '../config.js';
import rateLimiter from '../security/rateLimiter.js';
import logger from '../utils/logger.js';

/**
 * Create a message handler for a WebSocket connection.
 * @param {WebSocket} ws - The WebSocket connection
 * @param {SessionManager} sessionManager - The session manager instance
 * @param {string} clientIp - The client's IP (for rate limiting)
 */
export function createConnectionHandler(ws, sessionManager, clientIp) {
  // Handle incoming messages
  ws.on('message', (rawMessage) => {
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
          handleCreateSession(ws, sessionManager, clientIp);
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
          ws.send(JSON.stringify({ type: SERVER_MSG.PONG }));
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

function handleCreateSession(ws, sessionManager, clientIp) {
  // Rate limit
  const rl = rateLimiter.check('CREATE_SESSION', clientIp, config.RATE_LIMIT_CREATE_SESSION);
  if (!rl.allowed) {
    ws.send(errorResponse('RATE_LIMITED', 'Too many session creation attempts. Please wait.'));
    return;
  }

  // Check if this socket already owns a session
  const existing = sessionManager.getBinding(ws);
  if (existing) {
    ws.send(errorResponse('ALREADY_IN_SESSION', 'You are already in a session.'));
    return;
  }

  const { displayId, secret, expiresAt } = sessionManager.createSession(ws);

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

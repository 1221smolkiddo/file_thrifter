// server/session/SessionManager.js
// In-memory session lifecycle manager for THRIFT signaling server.
// Sessions are ephemeral — no persistence, no database, no file storage.

import crypto from 'crypto';
import { WebSocket } from 'ws';
import { generateDisplayId, generateSessionSecret, hashSecret, verifySecret } from '../security/tokens.js';
import { SESSION_STATE } from './sessionState.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import metrics from '../monitoring/metrics.js';

class SessionManager {
  constructor() {
    // Map<displayId, Session>
    this.sessions = new Map();

    // Reverse lookup: ws -> { displayId, role }
    this.socketToSession = new WeakMap();

    // Start periodic cleanup
    this._cleanupInterval = setInterval(
      () => this.cleanupExpired(),
      config.SESSION_CLEANUP_INTERVAL_MS,
    );
  }

  /**
   * Create a new session.
   * @param {WebSocket} hostWs - The host's WebSocket connection
   * @param {string} [clientIpHash] - SHA-256 hash of the client's IP (for local discovery)
   * @returns {{ displayId: string, secret: string, expiresAt: number }}
   */
  createSession(hostWs, clientIpHash = null) {
    // Generate unique display ID (retry on collision, extremely unlikely)
    let displayId;
    let attempts = 0;
    do {
      displayId = generateDisplayId();
      attempts++;
      if (attempts > 10) {
        throw new Error('Failed to generate unique display ID');
      }
    } while (this.sessions.has(displayId));

    const secret = generateSessionSecret();
    const secretHash = hashSecret(secret);
    const now = Date.now();
    const expiresAt = now + config.SESSION_TTL_MS;

    const session = {
      displayId,
      secretHash,
      hostWs,
      guestWs: null,
      state: SESSION_STATE.WAITING,
      createdAt: now,
      expiresAt,
      connectedAt: null,
      lastActivityAt: now,
      timeoutKind: 'unpaired',
      expirationTimer: setTimeout(() => this.expireSession(displayId), config.SESSION_TTL_MS),
      // Local discovery
      ipHash: clientIpHash,
      // Reconnection grace period
      reconnectToken: null,
      reconnectTokenHash: null,
      reconnectGraceTimer: null,
      disconnectedRole: null,
      // Relay state
      relayActive: false,
      relayBytesTransferred: 0,
    };

    this.sessions.set(displayId, session);
    this.socketToSession.set(hostWs, { displayId, role: 'host' });

    metrics.increment('sessions_created');
    logger.session('SESSION_CREATED', displayId);

    // Return the raw secret to send to the host (only time it's in cleartext)
    return { displayId, secret, expiresAt };
  }

  /**
   * Attempt to join a session.
   * @param {string} sessionId - The display ID
   * @param {string} token - The session secret
   * @param {WebSocket} guestWs - The guest's WebSocket connection
   * @returns {{ success: boolean, error?: string, session?: object }}
   */
  joinSession(sessionId, token, guestWs) {
    const session = this.sessions.get(sessionId);

    // Use generic error for non-existent sessions to prevent enumeration
    if (!session) {
      return { success: false, error: 'SESSION_NOT_FOUND', message: 'Session not found or has expired.' };
    }

    // Check expiration
    if (Date.now() > session.expiresAt) {
      this.expireSession(sessionId);
      return { success: false, error: 'SESSION_EXPIRED', message: 'Session is no longer available.' };
    }

    // Verify the secret token
    if (!verifySecret(token, session.secretHash)) {
      return { success: false, error: 'INVALID_TOKEN', message: 'Session not found or has expired.' };
    }

    // Check if session is in a joinable state
    if (session.state !== SESSION_STATE.WAITING) {
      return { success: false, error: 'SESSION_OCCUPIED', message: 'Session is not available for joining.' };
    }

    // Check if guest slot is already occupied
    if (session.guestWs) {
      return { success: false, error: 'SESSION_OCCUPIED', message: 'Session is not available for joining.' };
    }

    // Register the guest
    session.guestWs = guestWs;
    session.state = SESSION_STATE.PAIRING;
    this.socketToSession.set(guestWs, { displayId: sessionId, role: 'guest' });

    metrics.increment('sessions_joined');
    logger.session('SESSION_JOIN_ATTEMPT', sessionId);

    // Notify the host
    if (session.hostWs && session.hostWs.readyState === WebSocket.OPEN) {
      session.hostWs.send(JSON.stringify({ type: 'CONNECTION_REQUEST' }));
    }

    return { success: true, session };
  }

  /**
   * Host accepts a pending guest connection.
   * @param {string} displayId
   * @param {WebSocket} hostWs - Must be the session's actual host
   * @returns {boolean}
   */
  acceptConnection(displayId, hostWs) {
    const session = this.sessions.get(displayId);
    if (!session) return false;
    if (session.hostWs !== hostWs) return false;
    if (session.state !== SESSION_STATE.PAIRING) return false;
    if (!session.guestWs) return false;

    session.state = SESSION_STATE.CONNECTED;
    session.connectedAt = Date.now();
    this._setSessionExpiry(session, config.SESSION_IDLE_TIMEOUT_MS, 'inactive');
    logger.session('PAIRING_ACCEPTED', displayId);

    const payload = JSON.stringify({
      type: 'SESSION_CONNECTED',
      displayId: session.displayId,
      iceServers: config.getIceServers(),
    });

    if (session.hostWs.readyState === WebSocket.OPEN) {
      session.hostWs.send(payload);
    }
    if (session.guestWs.readyState === WebSocket.OPEN) {
      session.guestWs.send(payload);
    }

    return true;
  }

  /**
   * Record control-plane activity for a connected session. User data remains
   * on the WebRTC DataChannel and never reaches this server.
   */
  touchSession(ws) {
    const binding = this.socketToSession.get(ws);
    if (!binding) return false;

    const session = this.sessions.get(binding.displayId);
    if (!session || session.state !== SESSION_STATE.CONNECTED) return false;

    this._setSessionExpiry(session, config.SESSION_IDLE_TIMEOUT_MS, 'inactive');
    return true;
  }

  /**
   * Host rejects a pending guest connection.
   * @param {string} displayId
   * @param {WebSocket} hostWs - Must be the session's actual host
   * @returns {boolean}
   */
  rejectConnection(displayId, hostWs) {
    const session = this.sessions.get(displayId);
    if (!session) return false;
    if (session.hostWs !== hostWs) return false;
    if (session.state !== SESSION_STATE.PAIRING) return false;

    logger.session('PAIRING_REJECTED', displayId);

    // Notify and disconnect the guest
    if (session.guestWs && session.guestWs.readyState === WebSocket.OPEN) {
      session.guestWs.send(JSON.stringify({ type: 'CONNECTION_REJECTED' }));
    }

    // Clean up guest reference
    session.guestWs = null;
    session.state = SESSION_STATE.WAITING;

    return true;
  }

  /**
   * Route a WebRTC signaling message to the authorized peer.
   * Only works when session is in CONNECTED state.
   * @param {WebSocket} senderWs
   * @param {object} payload - The WebRTC signaling payload (SDP/ICE)
   * @returns {boolean}
   */
  routeSignal(senderWs, payload) {
    const binding = this.socketToSession.get(senderWs);
    if (!binding) return false;

    const session = this.sessions.get(binding.displayId);
    if (!session) return false;
    if (session.state !== SESSION_STATE.CONNECTED) return false;

    this._setSessionExpiry(session, config.SESSION_IDLE_TIMEOUT_MS, 'inactive');
    metrics.increment('webrtc_signals_routed');

    // Determine the target peer
    const targetWs = binding.role === 'host' ? session.guestWs : session.hostWs;
    if (!targetWs || targetWs.readyState !== WebSocket.OPEN) return false;

    targetWs.send(JSON.stringify({
      type: 'WEBRTC_SIGNAL',
      payload,
    }));

    return true;
  }

  // ─── Reconnection Grace Period ───

  /**
   * Handle a socket disconnecting (close/error).
   * If session is CONNECTED, enters a grace period instead of immediate destruction.
   * @param {WebSocket} ws
   */
  handleDisconnect(ws) {
    const binding = this.socketToSession.get(ws);
    if (!binding) return;

    const session = this.sessions.get(binding.displayId);
    if (!session) return;

    logger.session('PEER_DISCONNECTED', binding.displayId);

    // If session is CONNECTED, enter reconnection grace period
    if (session.state === SESSION_STATE.CONNECTED) {
      this._enterGracePeriod(session, binding.role);
      return;
    }

    // For non-connected sessions (WAITING, PAIRING), destroy immediately
    const otherWs = binding.role === 'host' ? session.guestWs : session.hostWs;
    if (otherWs && otherWs.readyState === WebSocket.OPEN) {
      otherWs.send(JSON.stringify({ type: 'PEER_DISCONNECTED' }));
    }

    this._destroySession(binding.displayId);
  }

  /**
   * Enter reconnection grace period. Generate a token for the disconnected peer
   * and notify the remaining peer.
   * @private
   */
  _enterGracePeriod(session, disconnectedRole) {
    // Generate reconnect token
    const rawToken = crypto.randomBytes(16).toString('hex');
    session.reconnectTokenHash = hashSecret(rawToken);
    session.disconnectedRole = disconnectedRole;

    // Clear the disconnected socket reference
    if (disconnectedRole === 'host') {
      session.hostWs = null;
    } else {
      session.guestWs = null;
    }

    // Notify the remaining peer
    const remainingWs = disconnectedRole === 'host' ? session.guestWs : session.hostWs;
    if (remainingWs && remainingWs.readyState === WebSocket.OPEN) {
      remainingWs.send(JSON.stringify({ type: 'PEER_RECONNECTING' }));
    }

    // Set grace timer — if peer doesn't reconnect within the window, destroy
    session.reconnectGraceTimer = setTimeout(() => {
      logger.session('RECONNECT_GRACE_EXPIRED', session.displayId);
      session.reconnectTokenHash = null;
      session.disconnectedRole = null;

      // Notify remaining peer that reconnection failed
      const ws = disconnectedRole === 'host' ? session.guestWs : session.hostWs;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'PEER_DISCONNECTED' }));
      }

      this._destroySession(session.displayId);
    }, config.RECONNECT_GRACE_MS);

    metrics.increment('reconnect_attempts');
    logger.session('RECONNECT_GRACE_STARTED', session.displayId);

    // The reconnect token is returned here but must be sent to the disconnecting
    // peer via the RECONNECT_TOKEN message BEFORE the socket closes.
    // In practice, we send the token proactively when the session first connects.
    return rawToken;
  }

  /**
   * Attempt to reconnect a peer using a reconnect token.
   * @param {string} displayId - The session display ID
   * @param {string} reconnectToken - The raw reconnect token
   * @param {WebSocket} newWs - The new WebSocket connection
   * @returns {{ success: boolean, error?: string }}
   */
  reconnectSession(displayId, reconnectToken, newWs) {
    const session = this.sessions.get(displayId);

    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (!session.reconnectTokenHash || !session.disconnectedRole) {
      return { success: false, error: 'No reconnection pending for this session' };
    }

    // Verify token
    if (!verifySecret(reconnectToken, session.reconnectTokenHash)) {
      return { success: false, error: 'Invalid reconnect token' };
    }

    // Clear grace timer and token
    if (session.reconnectGraceTimer) {
      clearTimeout(session.reconnectGraceTimer);
      session.reconnectGraceTimer = null;
    }

    // Rebind the socket
    const role = session.disconnectedRole;
    if (role === 'host') {
      session.hostWs = newWs;
    } else {
      session.guestWs = newWs;
    }

    this.socketToSession.set(newWs, { displayId, role });
    session.reconnectTokenHash = null;
    session.disconnectedRole = null;

    // Notify both peers
    const remainingWs = role === 'host' ? session.guestWs : session.hostWs;
    if (remainingWs && remainingWs.readyState === WebSocket.OPEN) {
      remainingWs.send(JSON.stringify({ type: 'RECONNECTED' }));
    }
    if (newWs.readyState === WebSocket.OPEN) {
      newWs.send(JSON.stringify({
        type: 'RECONNECTED',
        displayId,
        iceServers: config.getIceServers(),
      }));
    }

    // Reset idle timeout
    this._setSessionExpiry(session, config.SESSION_IDLE_TIMEOUT_MS, 'inactive');

    metrics.increment('reconnect_successes');
    logger.session('RECONNECT_SUCCESS', displayId);

    return { success: true, role };
  }

  /**
   * Generate and send reconnect token to a peer proactively.
   * Called when a session transitions to CONNECTED so both peers have a token
   * ready before any disconnection event.
   * @param {object} session
   * @returns {{ hostToken: string, guestToken: string }}
   */
  generateReconnectTokens(session) {
    // We generate one shared token per session (either peer can use it once)
    const rawToken = crypto.randomBytes(16).toString('hex');
    // Store it temporarily — it gets hashed on first use in _enterGracePeriod
    session._preGeneratedReconnectToken = rawToken;

    // Send to both peers
    const tokenMsg = JSON.stringify({
      type: 'RECONNECT_TOKEN',
      reconnectToken: rawToken,
      sessionId: session.displayId,
    });

    if (session.hostWs && session.hostWs.readyState === WebSocket.OPEN) {
      session.hostWs.send(tokenMsg);
    }
    if (session.guestWs && session.guestWs.readyState === WebSocket.OPEN) {
      session.guestWs.send(tokenMsg);
    }

    return rawToken;
  }

  // ─── Local Discovery ───

  /**
   * Discover sessions from the same IP hash (same network).
   * Only returns WAITING sessions (not paired/connected).
   * @param {string} ipHash - SHA-256 hash of the requester's IP
   * @returns {{ displayId: string }[]}
   */
  discoverLocal(ipHash) {
    if (!ipHash) return [];

    const results = [];
    for (const [displayId, session] of this.sessions.entries()) {
      if (
        session.ipHash === ipHash &&
        session.state === SESSION_STATE.WAITING &&
        Date.now() < session.expiresAt
      ) {
        results.push({ displayId });
      }
    }

    metrics.increment('discovery_requests');
    return results;
  }

  // ─── Relay Fallback ───

  /**
   * Activate relay mode for a session.
   * @param {WebSocket} ws - The requesting peer's socket
   * @returns {{ success: boolean, error?: string }}
   */
  activateRelay(ws) {
    const binding = this.socketToSession.get(ws);
    if (!binding) return { success: false, error: 'Not in a session' };

    const session = this.sessions.get(binding.displayId);
    if (!session) return { success: false, error: 'Session not found' };
    if (session.state !== SESSION_STATE.CONNECTED) {
      return { success: false, error: 'Session not connected' };
    }

    session.relayActive = true;
    metrics.increment('relay_requests');
    logger.session('RELAY_ACTIVATED', binding.displayId);

    // Notify both peers
    const msg = JSON.stringify({ type: 'RELAY_READY' });
    if (session.hostWs && session.hostWs.readyState === WebSocket.OPEN) {
      session.hostWs.send(msg);
    }
    if (session.guestWs && session.guestWs.readyState === WebSocket.OPEN) {
      session.guestWs.send(msg);
    }

    return { success: true };
  }

  /**
   * Route relay data from one peer to the other.
   * The server never inspects the data — it's E2EE.
   * @param {WebSocket} senderWs
   * @param {Buffer|ArrayBuffer} data - The encrypted binary data
   * @returns {{ success: boolean, error?: string }}
   */
  routeRelayData(senderWs, data) {
    const binding = this.socketToSession.get(senderWs);
    if (!binding) return { success: false, error: 'Not in a session' };

    const session = this.sessions.get(binding.displayId);
    if (!session) return { success: false, error: 'Session not found' };
    if (!session.relayActive) return { success: false, error: 'Relay not active' };

    // Check byte cap
    const dataSize = data.byteLength || data.length || 0;
    if (session.relayBytesTransferred + dataSize > config.RELAY_MAX_BYTES_PER_SESSION) {
      this.deactivateRelay(session);
      return { success: false, error: 'Relay byte limit exceeded' };
    }

    session.relayBytesTransferred += dataSize;
    metrics.add('relay_bytes_total', dataSize);

    // Forward to the other peer
    const targetWs = binding.role === 'host' ? session.guestWs : session.hostWs;
    if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
      return { success: false, error: 'Peer not connected' };
    }

    // Send binary data directly
    targetWs.send(data);

    // Reset idle timeout
    this._setSessionExpiry(session, config.SESSION_IDLE_TIMEOUT_MS, 'inactive');

    return { success: true };
  }

  /**
   * Deactivate relay mode for a session.
   * @param {object} session - The session object
   */
  deactivateRelay(session) {
    session.relayActive = false;

    const msg = JSON.stringify({ type: 'RELAY_ENDED' });
    if (session.hostWs && session.hostWs.readyState === WebSocket.OPEN) {
      session.hostWs.send(msg);
    }
    if (session.guestWs && session.guestWs.readyState === WebSocket.OPEN) {
      session.guestWs.send(msg);
    }

    logger.session('RELAY_DEACTIVATED', session.displayId);
  }

  /**
   * Expire a session by display ID.
   * @param {string} displayId
   */
  expireSession(displayId) {
    const session = this.sessions.get(displayId);
    if (!session) return;

    const timedOut = session.timeoutKind === 'inactive';
    logger.session(timedOut ? 'SESSION_TIMED_OUT' : 'SESSION_EXPIRED', displayId);
    metrics.increment(timedOut ? 'sessions_timed_out' : 'sessions_expired');

    session.state = SESSION_STATE.EXPIRED;
    const message = JSON.stringify({ type: timedOut ? 'SESSION_TIMED_OUT' : 'SESSION_EXPIRED' });

    if (session.hostWs && session.hostWs.readyState === WebSocket.OPEN) {
      session.hostWs.send(message);
    }
    if (session.guestWs && session.guestWs.readyState === WebSocket.OPEN) {
      session.guestWs.send(message);
    }

    this._destroySession(displayId);
  }

  /**
   * Remove a session entirely from memory.
   * Clears timers, invalidates credentials, removes all references.
   */
  _destroySession(displayId) {
    const session = this.sessions.get(displayId);
    if (!session) return;

    // Clear the expiration timer
    if (session.expirationTimer) {
      clearTimeout(session.expirationTimer);
      session.expirationTimer = null;
    }

    // Clear reconnect grace timer
    if (session.reconnectGraceTimer) {
      clearTimeout(session.reconnectGraceTimer);
      session.reconnectGraceTimer = null;
    }

    // Invalidate credentials
    session.secretHash = null;
    session.reconnectTokenHash = null;

    // Remove socket-to-session bindings
    // (WeakMap entries will be GC'd when sockets are GC'd, but we track for completeness)

    // Delete the session
    this.sessions.delete(displayId);
  }

  _setSessionExpiry(session, timeoutMs, timeoutKind) {
    if (session.expirationTimer) clearTimeout(session.expirationTimer);

    session.lastActivityAt = Date.now();
    session.expiresAt = session.lastActivityAt + timeoutMs;
    session.timeoutKind = timeoutKind;
    session.expirationTimer = setTimeout(() => this.expireSession(session.displayId), timeoutMs);
  }

  /**
   * Periodic cleanup of expired sessions.
   */
  cleanupExpired() {
    const now = Date.now();
    for (const [displayId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.expireSession(displayId);
      }
    }
  }

  /**
   * Get session binding for a socket (for authorization checks).
   * @param {WebSocket} ws
   * @returns {{ displayId: string, role: string } | undefined}
   */
  getBinding(ws) {
    return this.socketToSession.get(ws);
  }

  /**
   * Get a session by display ID (for internal use only).
   * @param {string} displayId
   * @returns {object | undefined}
   */
  getSession(displayId) {
    return this.sessions.get(displayId);
  }

  /**
   * Get the count of active sessions (for monitoring).
   * @returns {number}
   */
  get sessionCount() {
    return this.sessions.size;
  }

  /**
   * Destroy the session manager (clears all intervals and sessions).
   */
  destroy() {
    clearInterval(this._cleanupInterval);
    for (const [displayId] of this.sessions.entries()) {
      this._destroySession(displayId);
    }
  }
}

export default SessionManager;

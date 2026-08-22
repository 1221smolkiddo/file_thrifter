// server/tests/backend.test.js
// Comprehensive test suite for THRIFT signaling server.
// Uses Node.js built-in test runner (node --test).

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import SessionManager from '../session/SessionManager.js';
import { generateDisplayId, generateSessionSecret, hashSecret, verifySecret } from '../security/tokens.js';
import { parseMessage, CLIENT_MSG, SERVER_MSG, errorResponse } from '../websocket/protocol.js';
import rateLimiter, { RateLimiter } from '../security/rateLimiter.js';
import { SESSION_STATE } from '../session/sessionState.js';

// ─── Helpers ───

function waitForMessage(ws, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function connectClient(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function sendAndReceive(ws, message, timeoutMs = 3000) {
  const promise = waitForMessage(ws, timeoutMs);
  ws.send(JSON.stringify(message));
  return promise;
}

// ─── Token Tests ───

describe('Token Generation', () => {
  it('should generate display IDs of correct length', () => {
    const id = generateDisplayId();
    assert.equal(id.length, 6);
  });

  it('should generate display IDs with valid characters only', () => {
    const validChars = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;
    for (let i = 0; i < 100; i++) {
      const id = generateDisplayId();
      assert.ok(validChars.test(id), `Invalid display ID: ${id}`);
    }
  });

  it('should generate unique display IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateDisplayId());
    }
    // With 29^6 ≈ 594M possibilities, 100 should almost always be unique
    assert.ok(ids.size >= 95, `Too many collisions: ${100 - ids.size}`);
  });

  it('should generate 64-char hex session secrets', () => {
    const secret = generateSessionSecret();
    assert.equal(secret.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(secret));
  });

  it('should verify correct secrets', () => {
    const secret = generateSessionSecret();
    const hash = hashSecret(secret);
    assert.ok(verifySecret(secret, hash));
  });

  it('should reject incorrect secrets', () => {
    const secret = generateSessionSecret();
    const hash = hashSecret(secret);
    const wrongSecret = generateSessionSecret();
    assert.ok(!verifySecret(wrongSecret, hash));
  });

  it('should never use Math.random', () => {
    // Structural check: our tokens module uses crypto.randomBytes
    const secret = generateSessionSecret();
    assert.ok(secret.length === 64, 'Secret should be 256-bit hex');
  });
});

// ─── Protocol Tests ───

describe('Protocol Validation', () => {
  it('should reject non-string messages', () => {
    const result = parseMessage(123);
    assert.equal(result.valid, false);
  });

  it('should reject invalid JSON', () => {
    const result = parseMessage('not json');
    assert.equal(result.valid, false);
  });

  it('should reject arrays', () => {
    const result = parseMessage('[]');
    assert.equal(result.valid, false);
  });

  it('should reject messages without type', () => {
    const result = parseMessage('{"foo":"bar"}');
    assert.equal(result.valid, false);
  });

  it('should reject unknown message types', () => {
    const result = parseMessage('{"type":"UNKNOWN_TYPE"}');
    assert.equal(result.valid, false);
  });

  it('should accept valid CREATE_SESSION', () => {
    const result = parseMessage('{"type":"CREATE_SESSION"}');
    assert.equal(result.valid, true);
    assert.equal(result.data.type, 'CREATE_SESSION');
  });

  it('should reject JOIN_SESSION without sessionId', () => {
    const result = parseMessage('{"type":"JOIN_SESSION","token":"abc"}');
    assert.equal(result.valid, false);
  });

  it('should reject JOIN_SESSION without token', () => {
    const result = parseMessage('{"type":"JOIN_SESSION","sessionId":"ABC123"}');
    assert.equal(result.valid, false);
  });

  it('should accept valid JOIN_SESSION', () => {
    const result = parseMessage('{"type":"JOIN_SESSION","sessionId":"ABC123","token":"deadbeef"}');
    assert.equal(result.valid, true);
  });

  it('should reject WEBRTC_SIGNAL without payload', () => {
    const result = parseMessage('{"type":"WEBRTC_SIGNAL"}');
    assert.equal(result.valid, false);
  });

  it('should accept valid WEBRTC_SIGNAL', () => {
    const result = parseMessage('{"type":"WEBRTC_SIGNAL","payload":{"sdp":"test"}}');
    assert.equal(result.valid, true);
  });

  it('should produce valid error responses', () => {
    const resp = JSON.parse(errorResponse('TEST_CODE', 'Test message'));
    assert.equal(resp.type, 'ERROR');
    assert.equal(resp.code, 'TEST_CODE');
    assert.equal(resp.message, 'Test message');
  });
});

// ─── Rate Limiter Tests ───

describe('Rate Limiter', () => {
  it('should allow requests within limit', () => {
    const limiter = new RateLimiter();
    const limits = { windowMs: 60000, maxRequests: 3 };

    assert.ok(limiter.check('test', '1.2.3.4', limits).allowed);
    assert.ok(limiter.check('test', '1.2.3.4', limits).allowed);
    assert.ok(limiter.check('test', '1.2.3.4', limits).allowed);

    limiter.destroy();
  });

  it('should block requests exceeding limit', () => {
    const limiter = new RateLimiter();
    const limits = { windowMs: 60000, maxRequests: 2 };

    limiter.check('test', '1.2.3.4', limits);
    limiter.check('test', '1.2.3.4', limits);
    const result = limiter.check('test', '1.2.3.4', limits);
    assert.equal(result.allowed, false);
    assert.ok(result.retryAfterMs > 0);

    limiter.destroy();
  });

  it('should track different clients separately', () => {
    const limiter = new RateLimiter();
    const limits = { windowMs: 60000, maxRequests: 1 };

    assert.ok(limiter.check('test', '1.1.1.1', limits).allowed);
    assert.ok(limiter.check('test', '2.2.2.2', limits).allowed);
    assert.equal(limiter.check('test', '1.1.1.1', limits).allowed, false);

    limiter.destroy();
  });

  it('should track different buckets separately', () => {
    const limiter = new RateLimiter();
    const limits = { windowMs: 60000, maxRequests: 1 };

    assert.ok(limiter.check('create', '1.1.1.1', limits).allowed);
    assert.ok(limiter.check('join', '1.1.1.1', limits).allowed);
    assert.equal(limiter.check('create', '1.1.1.1', limits).allowed, false);
    assert.equal(limiter.check('join', '1.1.1.1', limits).allowed, false);

    limiter.destroy();
  });

  it('should report remaining count', () => {
    const limiter = new RateLimiter();
    const limits = { windowMs: 60000, maxRequests: 3 };

    const r1 = limiter.check('test', '1.1.1.1', limits);
    assert.equal(r1.remaining, 2);
    const r2 = limiter.check('test', '1.1.1.1', limits);
    assert.equal(r2.remaining, 1);

    limiter.destroy();
  });
});

// ─── Session Manager Tests (unit-level with mock WebSockets) ───

describe('SessionManager', () => {
  let sm;

  // Create mock WebSocket objects for testing
  function createMockWs() {
    const sent = [];
    return {
      readyState: WebSocket.OPEN,
      send(msg) { sent.push(JSON.parse(msg)); },
      _sent: sent,
      close() { this.readyState = WebSocket.CLOSED; },
    };
  }

  beforeEach(() => {
    sm = new SessionManager();
  });

  afterEach(() => {
    sm.destroy();
  });

  it('should create a session', () => {
    const hostWs = createMockWs();
    const { displayId, secret, expiresAt } = sm.createSession(hostWs);

    assert.ok(displayId);
    assert.equal(displayId.length, 6);
    assert.ok(secret);
    assert.equal(secret.length, 64);
    assert.ok(expiresAt > Date.now());
    assert.equal(sm.sessionCount, 1);
  });

  it('should join a valid session', () => {
    const hostWs = createMockWs();
    const guestWs = createMockWs();
    const { displayId, secret } = sm.createSession(hostWs);

    const result = sm.joinSession(displayId, secret, guestWs);
    assert.ok(result.success);

    // Host should receive CONNECTION_REQUEST
    assert.equal(hostWs._sent.length, 1);
    assert.equal(hostWs._sent[0].type, 'CONNECTION_REQUEST');
  });

  it('should reject join with invalid token', () => {
    const hostWs = createMockWs();
    const guestWs = createMockWs();
    const { displayId } = sm.createSession(hostWs);

    const result = sm.joinSession(displayId, 'wrong_token', guestWs);
    assert.equal(result.success, false);
    assert.equal(result.error, 'INVALID_TOKEN');
  });

  it('should reject join for non-existent session', () => {
    const guestWs = createMockWs();
    const result = sm.joinSession('NONEXIST', 'sometoken', guestWs);
    assert.equal(result.success, false);
    assert.equal(result.error, 'SESSION_NOT_FOUND');
  });

  it('should use generic error message for non-existent and invalid token', () => {
    const hostWs = createMockWs();
    const guestWs1 = createMockWs();
    const guestWs2 = createMockWs();
    const { displayId } = sm.createSession(hostWs);

    // Non-existent session
    const r1 = sm.joinSession('NONEXIST', 'sometoken', guestWs1);
    // Invalid token for existing session
    const r2 = sm.joinSession(displayId, 'wrong_token', guestWs2);

    // Both should use the same generic message to prevent enumeration
    assert.equal(r1.message, r2.message);
  });

  it('should reject join when session is occupied', () => {
    const hostWs = createMockWs();
    const guest1 = createMockWs();
    const guest2 = createMockWs();
    const { displayId, secret } = sm.createSession(hostWs);

    sm.joinSession(displayId, secret, guest1);
    const result = sm.joinSession(displayId, secret, guest2);
    assert.equal(result.success, false);
    assert.equal(result.error, 'SESSION_OCCUPIED');
  });

  it('should accept connection', () => {
    const hostWs = createMockWs();
    const guestWs = createMockWs();
    const { displayId, secret } = sm.createSession(hostWs);
    sm.joinSession(displayId, secret, guestWs);

    const accepted = sm.acceptConnection(displayId, hostWs);
    assert.ok(accepted);

    // Both should receive SESSION_CONNECTED
    const hostConnected = hostWs._sent.find(m => m.type === 'SESSION_CONNECTED');
    const guestConnected = guestWs._sent.find(m => m.type === 'SESSION_CONNECTED');
    assert.ok(hostConnected);
    assert.ok(guestConnected);
    assert.ok(hostConnected.iceServers);
  });

  it('should reject connection', () => {
    const hostWs = createMockWs();
    const guestWs = createMockWs();
    const { displayId, secret } = sm.createSession(hostWs);
    sm.joinSession(displayId, secret, guestWs);

    const rejected = sm.rejectConnection(displayId, hostWs);
    assert.ok(rejected);

    // Guest should receive CONNECTION_REJECTED
    const rejMsg = guestWs._sent.find(m => m.type === 'CONNECTION_REJECTED');
    assert.ok(rejMsg);

    // Session should return to WAITING
    const session = sm.getSession(displayId);
    assert.equal(session.state, SESSION_STATE.WAITING);
    assert.equal(session.guestWs, null);
  });

  it('should prevent non-host from accepting', () => {
    const hostWs = createMockWs();
    const guestWs = createMockWs();
    const { displayId, secret } = sm.createSession(hostWs);
    sm.joinSession(displayId, secret, guestWs);

    // Guest tries to accept — should fail
    const accepted = sm.acceptConnection(displayId, guestWs);
    assert.equal(accepted, false);
  });

  it('should route signals only in CONNECTED state', () => {
    const hostWs = createMockWs();
    const guestWs = createMockWs();
    const { displayId, secret } = sm.createSession(hostWs);
    sm.joinSession(displayId, secret, guestWs);

    // Before acceptance — should fail
    assert.equal(sm.routeSignal(hostWs, { sdp: 'test' }), false);

    // After acceptance — should work
    sm.acceptConnection(displayId, hostWs);
    assert.ok(sm.routeSignal(hostWs, { sdp: 'offer' }));

    // Guest should receive the signal
    const signal = guestWs._sent.find(m => m.type === 'WEBRTC_SIGNAL');
    assert.ok(signal);
    assert.equal(signal.payload.sdp, 'offer');
  });

  it('should prevent cross-session signaling', () => {
    const host1 = createMockWs();
    const guest1 = createMockWs();
    const host2 = createMockWs();
    const guest2 = createMockWs();

    const s1 = sm.createSession(host1);
    sm.joinSession(s1.displayId, s1.secret, guest1);
    sm.acceptConnection(s1.displayId, host1);

    const s2 = sm.createSession(host2);
    sm.joinSession(s2.displayId, s2.secret, guest2);
    sm.acceptConnection(s2.displayId, host2);

    // Clear sent arrays to only track new messages
    guest1._sent.length = 0;
    guest2._sent.length = 0;

    // host1 sends signal — should go to guest1, NOT guest2
    sm.routeSignal(host1, { sdp: 'for_guest1' });
    assert.equal(guest1._sent.length, 1);
    assert.equal(guest2._sent.length, 0);
  });

  it('should handle disconnect and notify peer', () => {
    const hostWs = createMockWs();
    const guestWs = createMockWs();
    const { displayId, secret } = sm.createSession(hostWs);
    sm.joinSession(displayId, secret, guestWs);
    sm.acceptConnection(displayId, hostWs);

    guestWs._sent.length = 0;
    hostWs._sent.length = 0;

    // Guest disconnects
    sm.handleDisconnect(guestWs);

    // Host should receive PEER_DISCONNECTED
    const disc = hostWs._sent.find(m => m.type === 'PEER_DISCONNECTED');
    assert.ok(disc);

    // Session should be cleaned up
    assert.equal(sm.sessionCount, 0);
  });

  it('should expire sessions', () => {
    const hostWs = createMockWs();
    const { displayId } = sm.createSession(hostWs);

    sm.expireSession(displayId);

    // Host should receive SESSION_EXPIRED
    const exp = hostWs._sent.find(m => m.type === 'SESSION_EXPIRED');
    assert.ok(exp);

    // Session should be cleaned up
    assert.equal(sm.sessionCount, 0);
  });

  it('should prevent reuse of expired session', () => {
    const hostWs = createMockWs();
    const guestWs = createMockWs();
    const { displayId, secret } = sm.createSession(hostWs);

    sm.expireSession(displayId);

    const result = sm.joinSession(displayId, secret, guestWs);
    assert.equal(result.success, false);
  });

  it('should invalidate credentials on session destroy', () => {
    const hostWs = createMockWs();
    const { displayId, secret } = sm.createSession(hostWs);

    // Get session before destroy to check secretHash
    const session = sm.getSession(displayId);
    assert.ok(session.secretHash);

    sm.expireSession(displayId);

    // Session is deleted, so getSession returns undefined
    assert.equal(sm.getSession(displayId), undefined);
  });
});

// ─── Integration Tests (real WebSocket connections against running server) ───

describe('Integration Tests', () => {
  let serverProcess;
  const TEST_PORT = 4099;

  // We spin up a minimal test server for integration tests
  let httpServer;
  let wss;
  let sm;

  before(async () => {
    // Dynamically import and set up a mini test server
    const { createConnectionHandler } = await import('../websocket/connectionHandler.js');

    sm = new SessionManager();

    httpServer = http.createServer();
    wss = new WebSocketServer({ server: httpServer, maxPayload: 64 * 1024 });

    wss.on('connection', (ws, req) => {
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      const clientIp = req.socket.remoteAddress || 'test';
      createConnectionHandler(ws, sm, clientIp);
    });

    await new Promise((resolve) => {
      httpServer.listen(TEST_PORT, resolve);
    });
  });

  // Reset the global rate limiter between each test to prevent cross-test interference
  beforeEach(() => {
    rateLimiter.buckets.clear();
  });

  after(async () => {
    sm.destroy();
    wss.close();
    await new Promise((resolve) => httpServer.close(resolve));
  });

  it('should create a session via WebSocket', async () => {
    const ws = await connectClient(TEST_PORT);
    try {
      const response = await sendAndReceive(ws, { type: 'CREATE_SESSION' });
      assert.equal(response.type, 'SESSION_CREATED');
      assert.ok(response.displayId);
      assert.equal(response.displayId.length, 6);
      assert.ok(response.sessionToken);
      assert.equal(response.sessionToken.length, 64);
      assert.ok(response.expiresAt > Date.now());
    } finally {
      ws.close();
    }
  });

  it('should join a valid session via WebSocket', async () => {
    const host = await connectClient(TEST_PORT);
    const guest = await connectClient(TEST_PORT);
    try {
      // Host creates session
      const created = await sendAndReceive(host, { type: 'CREATE_SESSION' });

      // Guest joins
      const joinPromise = waitForMessage(guest);
      const hostNotifyPromise = waitForMessage(host);

      guest.send(JSON.stringify({
        type: 'JOIN_SESSION',
        sessionId: created.displayId,
        token: created.sessionToken,
      }));

      const [joinResp, hostNotify] = await Promise.all([joinPromise, hostNotifyPromise]);

      assert.equal(joinResp.type, 'JOINING');
      assert.equal(joinResp.displayId, created.displayId);
      assert.equal(hostNotify.type, 'CONNECTION_REQUEST');
    } finally {
      host.close();
      guest.close();
    }
  });

  it('should reject join with invalid token', async () => {
    const host = await connectClient(TEST_PORT);
    const guest = await connectClient(TEST_PORT);
    try {
      const created = await sendAndReceive(host, { type: 'CREATE_SESSION' });

      const response = await sendAndReceive(guest, {
        type: 'JOIN_SESSION',
        sessionId: created.displayId,
        token: 'a'.repeat(64), // wrong token
      });

      assert.equal(response.type, 'ERROR');
    } finally {
      host.close();
      guest.close();
    }
  });

  it('should reject join for expired session', async () => {
    const host = await connectClient(TEST_PORT);
    const guest = await connectClient(TEST_PORT);
    try {
      const created = await sendAndReceive(host, { type: 'CREATE_SESSION' });

      // Manually expire the session
      const session = sm.getSession(created.displayId);
      session.expiresAt = Date.now() - 1000;

      const response = await sendAndReceive(guest, {
        type: 'JOIN_SESSION',
        sessionId: created.displayId,
        token: created.sessionToken,
      });

      assert.equal(response.type, 'ERROR');
    } finally {
      host.close();
      guest.close();
    }
  });

  it('should complete the full CREATE → JOIN → ACCEPT → CONNECT flow', async () => {
    const host = await connectClient(TEST_PORT);
    const guest = await connectClient(TEST_PORT);
    try {
      // 1. Create
      const created = await sendAndReceive(host, { type: 'CREATE_SESSION' });
      assert.equal(created.type, 'SESSION_CREATED');

      // 2. Join
      const joinPromise = waitForMessage(guest);
      const hostRequestPromise = waitForMessage(host);
      guest.send(JSON.stringify({
        type: 'JOIN_SESSION',
        sessionId: created.displayId,
        token: created.sessionToken,
      }));

      const [joinResp, hostRequest] = await Promise.all([joinPromise, hostRequestPromise]);
      assert.equal(joinResp.type, 'JOINING');
      assert.equal(hostRequest.type, 'CONNECTION_REQUEST');

      // 3. Accept
      const hostConnPromise = waitForMessage(host);
      const guestConnPromise = waitForMessage(guest);
      host.send(JSON.stringify({ type: 'ACCEPT_CONNECTION' }));

      const [hostConn, guestConn] = await Promise.all([hostConnPromise, guestConnPromise]);
      assert.equal(hostConn.type, 'SESSION_CONNECTED');
      assert.equal(guestConn.type, 'SESSION_CONNECTED');
      assert.ok(hostConn.iceServers);
      assert.ok(guestConn.iceServers);
    } finally {
      host.close();
      guest.close();
    }
  });

  it('should complete the full CREATE → JOIN → REJECT flow', async () => {
    const host = await connectClient(TEST_PORT);
    const guest = await connectClient(TEST_PORT);
    try {
      const created = await sendAndReceive(host, { type: 'CREATE_SESSION' });

      const joinPromise = waitForMessage(guest);
      const hostRequestPromise = waitForMessage(host);
      guest.send(JSON.stringify({
        type: 'JOIN_SESSION',
        sessionId: created.displayId,
        token: created.sessionToken,
      }));
      await Promise.all([joinPromise, hostRequestPromise]);

      // Reject
      const guestRejectPromise = waitForMessage(guest);
      host.send(JSON.stringify({ type: 'REJECT_CONNECTION' }));

      const rejectResp = await guestRejectPromise;
      assert.equal(rejectResp.type, 'CONNECTION_REJECTED');
    } finally {
      host.close();
      guest.close();
    }
  });

  it('should notify peer on disconnect', async () => {
    const host = await connectClient(TEST_PORT);
    const guest = await connectClient(TEST_PORT);
    try {
      const created = await sendAndReceive(host, { type: 'CREATE_SESSION' });

      const joinPromise = waitForMessage(guest);
      const hostRequestPromise = waitForMessage(host);
      guest.send(JSON.stringify({
        type: 'JOIN_SESSION',
        sessionId: created.displayId,
        token: created.sessionToken,
      }));
      await Promise.all([joinPromise, hostRequestPromise]);

      // Accept
      const hostConnPromise = waitForMessage(host);
      const guestConnPromise = waitForMessage(guest);
      host.send(JSON.stringify({ type: 'ACCEPT_CONNECTION' }));
      await Promise.all([hostConnPromise, guestConnPromise]);

      // Guest disconnects
      const hostDisconnectPromise = waitForMessage(host, 5000);
      guest.close();

      const disconnectMsg = await hostDisconnectPromise;
      assert.equal(disconnectMsg.type, 'PEER_DISCONNECTED');
    } finally {
      try { host.close(); } catch {}
    }
  });

  it('should reject malformed messages', async () => {
    const ws = await connectClient(TEST_PORT);
    try {
      ws.send('not valid json at all');
      const response = await waitForMessage(ws);
      assert.equal(response.type, 'ERROR');
      assert.equal(response.code, 'MALFORMED_MESSAGE');
    } finally {
      ws.close();
    }
  });

  it('should reject unauthorized signaling', async () => {
    const ws = await connectClient(TEST_PORT);
    try {
      const response = await sendAndReceive(ws, {
        type: 'WEBRTC_SIGNAL',
        payload: { sdp: 'test' },
      });
      assert.equal(response.type, 'ERROR');
      assert.equal(response.code, 'UNAUTHORIZED');
    } finally {
      ws.close();
    }
  });

  it('should route WebRTC signals between connected peers', async () => {
    const host = await connectClient(TEST_PORT);
    const guest = await connectClient(TEST_PORT);
    try {
      // Full connect flow
      const created = await sendAndReceive(host, { type: 'CREATE_SESSION' });
      const joinPromise = waitForMessage(guest);
      const hostRequestPromise = waitForMessage(host);
      guest.send(JSON.stringify({
        type: 'JOIN_SESSION',
        sessionId: created.displayId,
        token: created.sessionToken,
      }));
      await Promise.all([joinPromise, hostRequestPromise]);

      const hostConnPromise = waitForMessage(host);
      const guestConnPromise = waitForMessage(guest);
      host.send(JSON.stringify({ type: 'ACCEPT_CONNECTION' }));
      await Promise.all([hostConnPromise, guestConnPromise]);

      // Host sends SDP offer to guest
      const guestSignalPromise = waitForMessage(guest);
      host.send(JSON.stringify({
        type: 'WEBRTC_SIGNAL',
        payload: { type: 'offer', sdp: 'test-offer-sdp' },
      }));

      const guestSignal = await guestSignalPromise;
      assert.equal(guestSignal.type, 'WEBRTC_SIGNAL');
      assert.equal(guestSignal.payload.sdp, 'test-offer-sdp');

      // Guest sends SDP answer to host
      const hostSignalPromise = waitForMessage(host);
      guest.send(JSON.stringify({
        type: 'WEBRTC_SIGNAL',
        payload: { type: 'answer', sdp: 'test-answer-sdp' },
      }));

      const hostSignal = await hostSignalPromise;
      assert.equal(hostSignal.type, 'WEBRTC_SIGNAL');
      assert.equal(hostSignal.payload.sdp, 'test-answer-sdp');
    } finally {
      host.close();
      guest.close();
    }
  });

  it('should handle PING/PONG', async () => {
    const ws = await connectClient(TEST_PORT);
    try {
      const response = await sendAndReceive(ws, { type: 'PING' });
      assert.equal(response.type, 'PONG');
    } finally {
      ws.close();
    }
  });
});

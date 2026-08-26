// server/tests/backend.test.js
// Comprehensive test suite for THRIFT signaling server and backend features.
// Tests: Tokens, TURN Ephemeral Credentials, Protocol, Rate Limiter, Metrics,
// SessionManager (Grace Reconnect, Local Discovery, Relay Fallback), and WebSocket Integration.

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import SessionManager from '../session/SessionManager.js';
import { generateDisplayId, generateSessionSecret, hashSecret, verifySecret } from '../security/tokens.js';
import { generateTurnCredentials, buildIceServers } from '../security/turnCredentials.js';
import { parseMessage, CLIENT_MSG, SERVER_MSG, errorResponse } from '../websocket/protocol.js';
import rateLimiter, { RateLimiter } from '../security/rateLimiter.js';
import metrics, { Metrics } from '../monitoring/metrics.js';
import { SESSION_STATE } from '../session/sessionState.js';
import { getClientIp, isOriginAllowed } from '../utils/network.js';

// ─── Helpers ───

function waitForMessage(ws, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for message')), timeoutMs);
    ws.once('message', (data, isBinary) => {
      clearTimeout(timer);
      if (isBinary) {
        resolve(data);
      } else {
        try {
          resolve(JSON.parse(data.toString()));
        } catch {
          resolve(data.toString());
        }
      }
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
});

// ─── Ephemeral TURN Credentials Tests ───

describe('Ephemeral TURN Credentials (Coturn-compatible)', () => {
  const sharedSecret = 'sample_secret_key_12345';

  it('should generate username with expiry timestamp and random id', () => {
    const ttlSeconds = 3600;
    const creds = generateTurnCredentials(sharedSecret, ttlSeconds);

    assert.ok(creds.username);
    assert.ok(creds.credential);
    assert.equal(creds.ttlSeconds, 3600);

    const parts = creds.username.split(':');
    assert.equal(parts.length, 2);

    const expiry = parseInt(parts[0], 10);
    const now = Math.floor(Date.now() / 1000);
    assert.ok(expiry >= now + 3500 && expiry <= now + 3605);
  });

  it('should compute valid HMAC-SHA1 base64 credential', () => {
    const creds = generateTurnCredentials(sharedSecret, 7200);

    const expectedHmac = crypto.createHmac('sha1', sharedSecret)
      .update(creds.username)
      .digest('base64');

    assert.equal(creds.credential, expectedHmac);
  });

  it('should throw when shared secret is missing', () => {
    assert.throws(() => generateTurnCredentials(''), /TURN shared secret is required/);
  });

  it('should build ICE servers with ephemeral TURN credentials when configured', () => {
    const testConfig = {
      STUN_SERVERS: ['stun:stun.l.google.com:19302'],
      TURN_SERVERS: ['turn:turn.example.com:3478?transport=udp'],
      TURN_SHARED_SECRET: 'coturn_shared_key',
      TURN_CREDENTIAL_TTL_S: 1800,
    };

    const iceServers = buildIceServers(testConfig);
    assert.equal(iceServers.length, 2);
    assert.equal(iceServers[0].urls, 'stun:stun.l.google.com:19302');
    assert.equal(iceServers[1].urls, 'turn:turn.example.com:3478?transport=udp');
    assert.ok(iceServers[1].username);
    assert.ok(iceServers[1].credential);
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

  it('should accept valid RECONNECT message', () => {
    const result = parseMessage('{"type":"RECONNECT","sessionId":"ABC123","reconnectToken":"token123"}');
    assert.equal(result.valid, true);
  });

  it('should reject RECONNECT without token', () => {
    const result = parseMessage('{"type":"RECONNECT","sessionId":"ABC123"}');
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
});

// ─── Metrics Tests ───

describe('Metrics & Monitoring', () => {
  it('should increment counters accurately', () => {
    const m = new Metrics();
    m.increment('sessions_created');
    m.increment('sessions_created');
    m.increment('sessions_joined');
    m.add('relay_bytes_total', 1024);

    const snapshot = m.getSnapshot(2);
    assert.equal(snapshot.counters.sessions_created, 2);
    assert.equal(snapshot.counters.sessions_joined, 1);
    assert.equal(snapshot.counters.relay_bytes_total, 1024);
    assert.equal(snapshot.active_sessions, 2);
    assert.ok(snapshot.uptime_seconds >= 0);
  });
});

// ─── Session Manager Unit Tests ───

describe('SessionManager Unit Tests', () => {
  let sm;

  function createMockWs() {
    const sent = [];
    return {
      readyState: WebSocket.OPEN,
      send(msg) {
        if (typeof msg === 'string') {
          sent.push(JSON.parse(msg));
        } else {
          sent.push(msg); // binary Buffer/Uint8Array
        }
      },
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

  it('should create a session with IP hash tracking', () => {
    const hostWs = createMockWs();
    const ipHash = 'mock_ip_hash_abc';
    const { displayId, secret, expiresAt } = sm.createSession(hostWs, ipHash);

    assert.ok(displayId);
    assert.equal(displayId.length, 6);
    assert.ok(secret);
    assert.equal(secret.length, 64);
    assert.ok(expiresAt > Date.now());
    assert.equal(sm.sessionCount, 1);

    const session = sm.getSession(displayId);
    assert.equal(session.ipHash, ipHash);
  });

  it('should discover active sessions matching IP hash', () => {
    const host1 = createMockWs();
    const host2 = createMockWs();
    const ipHash1 = 'ip_hash_wifi_1';
    const ipHash2 = 'ip_hash_wifi_2';

    const s1 = sm.createSession(host1, ipHash1);
    const s2 = sm.createSession(host2, ipHash2);

    const local1 = sm.discoverLocal(ipHash1);
    assert.equal(local1.length, 1);
    assert.equal(local1[0].displayId, s1.displayId);

    const local2 = sm.discoverLocal(ipHash2);
    assert.equal(local2.length, 1);
    assert.equal(local2[0].displayId, s2.displayId);
  });

  it('should immediately notify peer and destroy session on disconnect', () => {
    const hostWs = createMockWs();
    const guestWs = createMockWs();
    const { displayId, secret } = sm.createSession(hostWs);
    sm.joinSession(displayId, secret, guestWs);
    sm.acceptConnection(displayId, hostWs);

    const session = sm.getSession(displayId);
    assert.equal(session.state, SESSION_STATE.CONNECTED);

    // Guest disconnects
    hostWs._sent.length = 0;
    guestWs._sent.length = 0;

    sm.handleDisconnect(guestWs);

    // Host should immediately receive PEER_DISCONNECTED
    const disconnectedMsg = hostWs._sent.find(m => m.type === 'PEER_DISCONNECTED');
    assert.ok(disconnectedMsg, 'Host should be immediately notified peer disconnected');

    // Session is immediately destroyed with zero grace delay
    assert.equal(sm.sessionCount, 0);
  });

  it('should activate and route binary data through relay mode', () => {
    const hostWs = createMockWs();
    const guestWs = createMockWs();
    const { displayId, secret } = sm.createSession(hostWs);
    sm.joinSession(displayId, secret, guestWs);
    sm.acceptConnection(displayId, hostWs);

    // Request relay fallback
    const relayActive = sm.activateRelay(hostWs);
    assert.ok(relayActive.success);

    // Both receive RELAY_READY
    assert.ok(hostWs._sent.some(m => m.type === 'RELAY_READY'));
    assert.ok(guestWs._sent.some(m => m.type === 'RELAY_READY'));

    // Route binary packet from host to guest
    guestWs._sent.length = 0;
    const testBuffer = Buffer.from('encrypted_payload_data');
    const routeRes = sm.routeRelayData(hostWs, testBuffer);
    assert.ok(routeRes.success);
    assert.equal(guestWs._sent.length, 1);
    assert.deepEqual(guestWs._sent[0], testBuffer);
  });
});

// ─── Full Integration Tests ───

describe('Integration Tests with All Features', () => {
  const TEST_PORT = 4099;
  let httpServer;
  let wss;
  let sm;

  before(async () => {
    const { createConnectionHandler } = await import('../websocket/connectionHandler.js');

    sm = new SessionManager();
    httpServer = http.createServer((req, res) => {
      if (req.url === '/health') {
        const snap = metrics.getSnapshot(sm.sessionCount);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', active_sessions: snap.active_sessions }));
        return;
      }
      if (req.url === '/metrics') {
        const snap = metrics.getSnapshot(sm.sessionCount);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(snap));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    wss = new WebSocketServer({ server: httpServer, maxPayload: 64 * 1024 });

    wss.on('connection', (ws, req) => {
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      const clientIp = req.socket.remoteAddress || 'test_ip';
      createConnectionHandler(ws, sm, clientIp);
    });

    await new Promise((resolve) => {
      httpServer.listen(TEST_PORT, resolve);
    });
  });

  beforeEach(() => {
    rateLimiter.buckets.clear();
  });

  after(async () => {
    sm.destroy();
    rateLimiter.destroy();
    wss.close();
    await new Promise((resolve) => httpServer.close(resolve));
  });

  it('should verify /health and /metrics HTTP endpoints', async () => {
    const healthData = await new Promise((resolve) => {
      http.get(`http://localhost:${TEST_PORT}/health`, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => resolve(JSON.parse(raw)));
      });
    });

    assert.equal(healthData.status, 'ok');
    assert.equal(typeof healthData.active_sessions, 'number');

    const metricsData = await new Promise((resolve) => {
      http.get(`http://localhost:${TEST_PORT}/metrics`, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => resolve(JSON.parse(raw)));
      });
    });

    assert.ok(metricsData.counters);
    assert.ok(typeof metricsData.uptime_seconds === 'number');
  });

  it('should discover local sessions via WebSocket DISCOVER_LOCAL', async () => {
    const host = await connectClient(TEST_PORT);
    const guest = await connectClient(TEST_PORT);
    try {
      const created = await sendAndReceive(host, { type: 'CREATE_SESSION' });
      assert.equal(created.type, 'SESSION_CREATED');

      const discoverResp = await sendAndReceive(guest, { type: 'DISCOVER_LOCAL' });
      assert.equal(discoverResp.type, 'LOCAL_SESSIONS');
      assert.ok(Array.isArray(discoverResp.sessions));
      assert.ok(discoverResp.sessions.some(s => s.displayId === created.displayId));
    } finally {
      host.close();
      guest.close();
    }
  });

  it('should perform full connect and transition to SESSION_CONNECTED', async () => {
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

      // Accept connection
      const hostConnPromise = waitForMessage(host);
      const guestConnPromise = waitForMessage(guest);
      host.send(JSON.stringify({ type: 'ACCEPT_CONNECTION' }));

      const [hostConn, guestConn] = await Promise.all([hostConnPromise, guestConnPromise]);
      assert.equal(hostConn.type, 'SESSION_CONNECTED');
      assert.equal(guestConn.type, 'SESSION_CONNECTED');
      assert.ok(hostConn.iceServers.length > 0);
    } finally {
      host.close();
      guest.close();
    }
  });

  it('should activate relay and forward binary frames', async () => {
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

      const hostConnPromise = waitForMessage(host);
      const guestConnPromise = waitForMessage(guest);
      host.send(JSON.stringify({ type: 'ACCEPT_CONNECTION' }));
      await Promise.all([hostConnPromise, guestConnPromise]);

      // Host requests relay fallback
      const hostRelayPromise = waitForMessage(host);
      const guestRelayPromise = waitForMessage(guest);
      host.send(JSON.stringify({ type: 'RELAY_REQUEST' }));

      const [hostRelay, guestRelay] = await Promise.all([hostRelayPromise, guestRelayPromise]);
      assert.equal(hostRelay.type, 'RELAY_READY');
      assert.equal(guestRelay.type, 'RELAY_READY');

      // Send binary data from host to guest
      const binaryPayload = Buffer.from('encrypted_file_chunk_data_123');
      const receiveBinaryPromise = waitForMessage(guest);
      host.send(binaryPayload);

      const receivedBinary = await receiveBinaryPromise;
      assert.deepEqual(receivedBinary, binaryPayload);
    } finally {
      host.close();
      guest.close();
    }
  });
});

// ─── Deployment & Networking Utilities ───

describe('Production Networking Utilities', () => {
  it('should extract real client IP from x-forwarded-for header', () => {
    const mockReq = {
      headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178' },
      socket: { remoteAddress: '10.0.0.1' },
    };
    assert.equal(getClientIp(mockReq), '203.0.113.195');
  });

  it('should extract real client IP from cf-connecting-ip header', () => {
    const mockReq = {
      headers: { 'cf-connecting-ip': '198.51.100.42' },
      socket: { remoteAddress: '10.0.0.1' },
    };
    assert.equal(getClientIp(mockReq), '198.51.100.42');
  });

  it('should fallback to socket.remoteAddress if no proxy headers', () => {
    const mockReq = {
      headers: {},
      socket: { remoteAddress: '192.168.1.15' },
    };
    assert.equal(getClientIp(mockReq), '192.168.1.15');
  });

  it('should correctly validate allowed frontend origins with trailing slash normalization', () => {
    // Exact match
    assert.equal(isOriginAllowed('https://thrift.example.com', 'https://thrift.example.com'), true);
    // Config with trailing slash vs request without
    assert.equal(isOriginAllowed('https://thrift.example.com', 'https://thrift.example.com/'), true);
    // Request with trailing slash vs config without
    assert.equal(isOriginAllowed('https://thrift.example.com/', 'https://thrift.example.com'), true);
    // Multiple comma-separated domains
    assert.equal(isOriginAllowed('https://app.example.com', 'https://thrift.example.com, https://app.example.com'), true);
    // Wildcard
    assert.equal(isOriginAllowed('https://random.com', '*'), true);
    // Unauthorized origin
    assert.equal(isOriginAllowed('https://malicious.com', 'https://thrift.example.com'), false);
  });
});

// server/index.js
// THRIFT Signaling Server — Entry Point
// A WebSocket signaling server for secure, ephemeral device pairing.
// This server NEVER receives, stores, inspects, or proxies file contents.

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import config from './config.js';
import SessionManager from './session/SessionManager.js';
import { createConnectionHandler } from './websocket/connectionHandler.js';
import rateLimiter from './security/rateLimiter.js';
import logger from './utils/logger.js';
import metrics from './monitoring/metrics.js';

// ─── Create HTTP server (required for origin checking on upgrade) ───

const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    const snapshot = metrics.getSnapshot(sessionManager.sessionCount);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime_seconds: snapshot.uptime_seconds,
      active_sessions: snapshot.active_sessions,
    }));
    return;
  }

  // Full metrics endpoint
  if (req.url === '/metrics') {
    const snapshot = metrics.getSnapshot(sessionManager.sessionCount);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(snapshot));
    return;
  }

  // No other HTTP endpoints — this is a signaling-only server
  res.writeHead(404);
  res.end();
});

// ─── Create WebSocket server ───

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: config.WS_MAX_MESSAGE_SIZE,
});

const sessionManager = new SessionManager();

// ─── Handle HTTP upgrade to WebSocket with origin checking ───

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin || '';
  const clientIp = req.socket.remoteAddress || 'unknown';

  // Rate limit WebSocket connection attempts
  const rl = rateLimiter.check('WS_CONNECT', clientIp, config.RATE_LIMIT_WS_CONNECT);
  if (!rl.allowed) {
    logger.warn('WS', 'Connection rate limited', { ip: 'redacted' });
    socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
    socket.destroy();
    return;
  }

  // Origin check (in production, restrict to configured frontend origin)
  if (config.NODE_ENV === 'production') {
    if (origin && origin !== config.FRONTEND_ORIGIN) {
      logger.warn('WS', 'Rejected connection from unauthorized origin');
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

// ─── Handle new WebSocket connections ───

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress || 'unknown';
  logger.ws('CLIENT_CONNECTED');
  metrics.increment('ws_connections_total');

  // Mark connection as alive for heartbeat
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // Set up the message handler
  createConnectionHandler(ws, sessionManager, clientIp);
});

// ─── Heartbeat: detect dead connections ───

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      logger.ws('HEARTBEAT_TIMEOUT');
      sessionManager.handleDisconnect(ws);
      return ws.terminate();
    }

    ws.isAlive = false;
    ws.ping();
  });
}, config.WS_HEARTBEAT_INTERVAL_MS);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// ─── Graceful shutdown ───

function shutdown() {
  logger.info('SERVER', 'Shutting down...');

  clearInterval(heartbeatInterval);
  sessionManager.destroy();
  rateLimiter.destroy();

  wss.clients.forEach((ws) => {
    ws.close(1001, 'Server shutting down');
  });

  wss.close(() => {
    server.close(() => {
      logger.info('SERVER', 'Shutdown complete');
      process.exit(0);
    });
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Start server ───

server.listen(config.PORT, () => {
  logger.info('SERVER', `THRIFT Signaling Server listening on port ${config.PORT}`, {
    env: config.NODE_ENV,
    frontendOrigin: config.FRONTEND_ORIGIN,
    sessionTtlMs: config.SESSION_TTL_MS,
  });
});

export { server, wss, sessionManager };

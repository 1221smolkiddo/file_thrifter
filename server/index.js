// server/index.js
// THRIFT Signaling Server — Entry Point
// A WebSocket signaling server for secure, ephemeral device pairing.
// This server NEVER receives, stores, inspects, or proxies file contents.

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import SessionManager from './session/SessionManager.js';
import { createConnectionHandler } from './websocket/connectionHandler.js';
import rateLimiter from './security/rateLimiter.js';
import logger from './utils/logger.js';
import metrics from './monitoring/metrics.js';
import { getClientIp, isOriginAllowed } from './utils/network.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIST = path.resolve(__dirname, '../client/dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

/**
 * Lightweight static file handler for single-service deployments where client/dist is present.
 */
function serveStatic(req, res) {
  if (!fs.existsSync(CLIENT_DIST)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const urlPath = req.url.split('?')[0];
  let filePath = path.join(CLIENT_DIST, urlPath === '/' ? 'index.html' : urlPath);

  // Prevent directory traversal
  if (!filePath.startsWith(CLIENT_DIST)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isImmutableAsset = urlPath.startsWith('/assets/');
    const headers = {
      'Content-Type': contentType,
      ...(isImmutableAsset
        ? { 'Cache-Control': 'public, max-age=31536000, immutable' }
        : { 'Cache-Control': 'no-cache' }),
    };

    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // SPA fallback to index.html
  const indexPath = path.join(CLIENT_DIST, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(indexPath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

// ─── Create HTTP server ───

const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    const snapshot = metrics.getSnapshot(sessionManager.sessionCount);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
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
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(JSON.stringify(snapshot));
    return;
  }

  // Serve static assets or SPA index if available
  serveStatic(req, res);
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
  const clientIp = getClientIp(req);

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
    if (!isOriginAllowed(origin, config.FRONTEND_ORIGIN)) {
      logger.warn('WS', 'Rejected connection from unauthorized origin', { origin });
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
  const clientIp = getClientIp(req);
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

if (heartbeatInterval.unref) {
  heartbeatInterval.unref();
}

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

if (process.env.NODE_ENV !== 'test') {
  server.listen(config.PORT, () => {
    logger.info('SERVER', `THRIFT Signaling Server listening on port ${config.PORT}`, {
      env: config.NODE_ENV,
      frontendOrigin: config.FRONTEND_ORIGIN,
      sessionTtlMs: config.SESSION_TTL_MS,
    });
  });
}

export { server, wss, sessionManager };

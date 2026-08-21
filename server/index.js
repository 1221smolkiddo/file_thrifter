import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

const PORT = process.env.PORT || 4000;
const wss = new WebSocketServer({ port: PORT });

// Active sessions stored by sessionToken
// sessionToken -> { displayId, sessionToken, hostWs, peerWs, expiresAt, state }
const sessions = new Map();

function generateDisplayId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars O, 0, I, 1
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex'); // 256-bit entropy token
}

// Clean up expired sessions periodically (every 30s)
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      notifyAndCleanup(token, 'SESSION_EXPIRED');
    }
  }
}, 30000);

function notifyAndCleanup(token, reason) {
  const session = sessions.get(token);
  if (!session) return;

  const message = JSON.stringify({ type: reason });
  if (session.hostWs && session.hostWs.readyState === WebSocket.OPEN) {
    session.hostWs.send(message);
  }
  if (session.peerWs && session.peerWs.readyState === WebSocket.OPEN) {
    session.peerWs.send(message);
  }

  sessions.delete(token);
}

wss.on('connection', (ws) => {
  let boundToken = null;
  let isHost = false;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'CREATE_SESSION': {
          const sessionToken = generateToken();
          const displayId = generateDisplayId();
          const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

          const session = {
            displayId,
            sessionToken,
            hostWs: ws,
            peerWs: null,
            expiresAt,
            state: 'WAITING_FOR_DEVICE'
          };

          sessions.set(sessionToken, session);
          boundToken = sessionToken;
          isHost = true;

          ws.send(JSON.stringify({
            type: 'SESSION_CREATED',
            displayId,
            sessionToken,
            expiresAt
          }));
          break;
        }

        case 'JOIN_SESSION': {
          const { sessionToken } = data;
          const session = sessions.get(sessionToken);

          if (!session) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Session not found or expired' }));
            return;
          }

          if (Date.now() > session.expiresAt) {
            notifyAndCleanup(sessionToken, 'SESSION_EXPIRED');
            return;
          }

          session.peerWs = ws;
          session.state = 'PAIRING';
          boundToken = sessionToken;
          isHost = false;

          // Notify Host that a device wants to connect
          if (session.hostWs && session.hostWs.readyState === WebSocket.OPEN) {
            session.hostWs.send(JSON.stringify({ type: 'CONNECTION_REQUEST' }));
          }

          ws.send(JSON.stringify({ type: 'JOINING', displayId: session.displayId }));
          break;
        }

        case 'ACCEPT_CONNECTION': {
          const session = sessions.get(data.sessionToken || boundToken);
          if (!session || ws !== session.hostWs) return;

          session.state = 'CONNECTED';
          const payload = JSON.stringify({ type: 'CONNECTED', displayId: session.displayId });

          if (session.hostWs && session.hostWs.readyState === WebSocket.OPEN) {
            session.hostWs.send(payload);
          }
          if (session.peerWs && session.peerWs.readyState === WebSocket.OPEN) {
            session.peerWs.send(payload);
          }
          break;
        }

        case 'REJECT_CONNECTION': {
          const session = sessions.get(data.sessionToken || boundToken);
          if (!session || ws !== session.hostWs) return;

          if (session.peerWs && session.peerWs.readyState === WebSocket.OPEN) {
            session.peerWs.send(JSON.stringify({ type: 'CONNECTION_REJECTED' }));
          }
          session.peerWs = null;
          session.state = 'WAITING_FOR_DEVICE';
          break;
        }

        case 'TRANSFER_META':
        case 'TRANSFER_PROGRESS':
        case 'TRANSFER_COMPLETE':
        case 'TRANSFER_CANCEL': {
          const session = sessions.get(boundToken);
          if (!session) return;

          const targetWs = isHost ? session.peerWs : session.hostWs;
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify(data));
          }
          break;
        }

        case 'PING': {
          ws.send(JSON.stringify({ type: 'PONG' }));
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    if (boundToken) {
      const session = sessions.get(boundToken);
      if (session) {
        const otherWs = isHost ? session.peerWs : session.hostWs;
        if (otherWs && otherWs.readyState === WebSocket.OPEN) {
          otherWs.send(JSON.stringify({ type: 'PEER_DISCONNECTED' }));
        }
        sessions.delete(boundToken);
      }
    }
  });
});

console.log(`[THRIFT WebSocket Server] Listening on ws://localhost:${PORT}`);

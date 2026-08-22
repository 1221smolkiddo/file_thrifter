// server/session/sessionState.js
// Session state constants for the THRIFT signaling server.

export const SESSION_STATE = {
  WAITING: 'WAITING',         // Host created session, waiting for a guest to join
  PAIRING: 'PAIRING',         // Guest connected, awaiting host approval
  CONNECTED: 'CONNECTED',     // Both peers authorized and connected
  CLOSING: 'CLOSING',         // Session is in the process of closing
  EXPIRED: 'EXPIRED',         // Session TTL exceeded
};

import { useState, useEffect, useRef, useCallback } from 'react';

export const APP_STATE = {
  IDLE: 'IDLE',
  CREATING_SESSION: 'CREATING_SESSION',
  WAITING_FOR_DEVICE: 'WAITING_FOR_DEVICE',
  PAIRING: 'PAIRING',
  WEBRTC_CONNECTING: 'WEBRTC_CONNECTING',
  ROLE_SELECTION: 'ROLE_SELECTION',
  CONNECTED: 'CONNECTED',
  TRANSFERRING: 'TRANSFERRING',
  COMPLETED: 'COMPLETED',
  DISCONNECTED: 'DISCONNECTED',
  EXPIRED: 'EXPIRED',
  ERROR: 'ERROR',
};

export function useWebSocketSession() {
  const [appState, setAppState] = useState(APP_STATE.IDLE);
  const [sessionData, setSessionData] = useState({
    displayId: null,
    sessionToken: null, // The secret token (used for QR / join URL)
    expiresAt: null,
    isHost: false,
    errorMessage: null,
    iceServers: null,
  });
  const [incomingRequest, setIncomingRequest] = useState(false);
  const wsRef = useRef(null);
  const onWebRtcSignalRef = useRef(null);

  // Initialize WS connection
  const connectWs = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return wsRef.current;
    }

    const host = window.location.hostname || 'localhost';
    const wsUrl = `ws://${host}:4000`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[THRIFT] WebSocket connected to', wsUrl);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('[THRIFT] Received event:', msg.type);

        switch (msg.type) {
          case 'SESSION_CREATED': {
            setSessionData({
              displayId: msg.displayId,
              sessionToken: msg.sessionToken,
              expiresAt: msg.expiresAt,
              isHost: true,
              errorMessage: null,
              iceServers: null,
            });
            setAppState(APP_STATE.WAITING_FOR_DEVICE);
            break;
          }

          case 'JOINING': {
            setSessionData((prev) => ({
              ...prev,
              displayId: msg.displayId,
              isHost: false,
            }));
            setAppState(APP_STATE.PAIRING);
            break;
          }

          case 'CONNECTION_REQUEST': {
            setIncomingRequest(true);
            setAppState(APP_STATE.PAIRING);
            break;
          }

          // New protocol: SESSION_CONNECTED — triggers WebRTC negotiation
          case 'SESSION_CONNECTED': {
            setIncomingRequest(false);
            setSessionData((prev) => ({
              ...prev,
              iceServers: msg.iceServers || null,
            }));
            setAppState(APP_STATE.WEBRTC_CONNECTING);
            break;
          }

          // Keep backward compat with old 'CONNECTED' message type during transition
          case 'CONNECTED': {
            setIncomingRequest(false);
            setAppState(APP_STATE.CONNECTED);
            break;
          }

          case 'CONNECTION_REJECTED': {
            setAppState(APP_STATE.ERROR);
            setSessionData((prev) => ({
              ...prev,
              errorMessage: 'Connection request rejected by host device.',
            }));
            break;
          }

          case 'SESSION_EXPIRED': {
            setAppState(APP_STATE.EXPIRED);
            break;
          }

          case 'PEER_DISCONNECTED': {
            setAppState(APP_STATE.DISCONNECTED);
            break;
          }

          case 'WEBRTC_SIGNAL': {
            if (onWebRtcSignalRef.current) {
              onWebRtcSignalRef.current(msg.payload);
            }
            break;
          }

          case 'ERROR': {
            setAppState(APP_STATE.ERROR);
            setSessionData((prev) => ({ ...prev, errorMessage: msg.message }));
            break;
          }

          case 'PONG':
            // Heartbeat response, no action needed
            break;

          default:
            break;
        }
      } catch (err) {
        console.error('[THRIFT] Error parsing WS message:', err);
      }
    };

    socket.onclose = () => {
      console.log('[THRIFT] WebSocket closed');
    };

    socket.onerror = (err) => {
      console.error('[THRIFT] WebSocket error:', err);
    };

    wsRef.current = socket;
    return socket;
  }, []);

  useEffect(() => {
    connectWs();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWs]);

  const send = (data) => {
    const socket = connectWs();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    } else {
      setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(data));
        }
      }, 300);
    }
  };

  const createSession = useCallback(() => {
    setAppState(APP_STATE.CREATING_SESSION);
    send({ type: 'CREATE_SESSION' });
  }, []);

  /**
   * Join a session using the display ID and secret token.
   * @param {string} sessionId - The 6-character display ID
   * @param {string} token - The 256-bit hex secret
   */
  const joinSession = useCallback((sessionId, token) => {
    setAppState(APP_STATE.PAIRING);
    setSessionData((prev) => ({ ...prev, displayId: sessionId, isHost: false }));
    send({ type: 'JOIN_SESSION', sessionId, token });
  }, []);

  const sendWebRtcSignal = useCallback((signalMsg) => {
    send(signalMsg);
  }, []);

  const setOnWebRtcSignal = useCallback((handler) => {
    onWebRtcSignalRef.current = handler;
  }, []);

  const acceptConnection = useCallback(() => {
    send({ type: 'ACCEPT_CONNECTION' });
  }, []);

  const rejectConnection = useCallback(() => {
    send({ type: 'REJECT_CONNECTION' });
    setIncomingRequest(false);
    setAppState(APP_STATE.WAITING_FOR_DEVICE);
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setAppState(APP_STATE.IDLE);
    setSessionData({
      displayId: null,
      sessionToken: null,
      expiresAt: null,
      isHost: false,
      errorMessage: null,
      iceServers: null,
    });
    setIncomingRequest(false);
  }, []);

  return {
    appState,
    sessionData,
    incomingRequest,
    createSession,
    joinSession,
    acceptConnection,
    rejectConnection,
    sendWebRtcSignal,
    setOnWebRtcSignal,
    disconnect,
    setAppState,
  };
}

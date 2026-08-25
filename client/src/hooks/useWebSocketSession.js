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
  TRANSFER_ERROR: 'TRANSFER_ERROR',
  DISCONNECTED: 'DISCONNECTED',
  TIMED_OUT: 'TIMED_OUT',
  EXPIRED: 'EXPIRED',
  ERROR: 'ERROR',
  // New states for reconnection
  PEER_RECONNECTING: 'PEER_RECONNECTING',
  RECONNECTING: 'RECONNECTING',
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
  const [localSessions, setLocalSessions] = useState([]);
  const [relayMode, setRelayMode] = useState(false);
  const wsRef = useRef(null);
  const onWebRtcSignalRef = useRef(null);
  const onRelayDataRef = useRef(null);
  const reconnectTokenRef = useRef(null);
  const reconnectSessionIdRef = useRef(null);

  const appStateRef = useRef(appState);
  const sessionDataRef = useRef(sessionData);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    sessionDataRef.current = sessionData;
  }, [sessionData]);

  // Initialize WS connection
  const connectWs = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return wsRef.current;
    }

    const host = window.location.hostname || 'localhost';
    const defaultProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const defaultPort = window.location.port === '5173' || window.location.port === '3000' ? ':4000' : (window.location.port ? `:${window.location.port}` : '');
    const wsUrl = import.meta.env.VITE_WS_URL || `${defaultProto}//${host}${defaultPort}`;
    const socket = new WebSocket(wsUrl);

    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      console.log('[THRIFT] WebSocket connected to', wsUrl);

      // If we have a reconnect token, attempt to reconnect automatically
      if (reconnectTokenRef.current && reconnectSessionIdRef.current) {
        console.log('[THRIFT] Attempting auto-reconnect...');
        socket.send(JSON.stringify({
          type: 'RECONNECT',
          reconnectToken: reconnectTokenRef.current,
          sessionId: reconnectSessionIdRef.current,
        }));
        reconnectTokenRef.current = null;
      } else {
        // Send local discovery request on fresh connections
        socket.send(JSON.stringify({ type: 'DISCOVER_LOCAL' }));
      }
    };

    socket.onmessage = (event) => {
      try {
        // Binary messages are relay data
        if (event.data instanceof ArrayBuffer) {
          if (onRelayDataRef.current) {
            onRelayDataRef.current(event.data);
          }
          return;
        }

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
            if (appStateRef.current !== APP_STATE.IDLE) {
              setAppState(APP_STATE.ERROR);
              setSessionData((prev) => ({
                ...prev,
                errorMessage: 'Connection request rejected by host device.',
              }));
            }
            break;
          }

          case 'SESSION_EXPIRED': {
            if (appStateRef.current !== APP_STATE.IDLE && sessionDataRef.current?.displayId) {
              setAppState(APP_STATE.EXPIRED);
            }
            break;
          }

          case 'SESSION_TIMED_OUT': {
            if (appStateRef.current !== APP_STATE.IDLE && sessionDataRef.current?.displayId) {
              setAppState(APP_STATE.TIMED_OUT);
              setSessionData((prev) => ({
                ...prev,
                errorMessage: 'Connection timed out after 5 minutes of inactivity.',
              }));
            }
            break;
          }

          case 'PEER_DISCONNECTED': {
            if (appStateRef.current !== APP_STATE.IDLE && sessionDataRef.current?.displayId) {
              setAppState(APP_STATE.DISCONNECTED);
            }
            break;
          }

          case 'WEBRTC_SIGNAL': {
            if (onWebRtcSignalRef.current) {
              onWebRtcSignalRef.current(msg.payload);
            }
            break;
          }

          // ─── Reconnection Messages ───

          case 'RECONNECT_TOKEN': {
            console.log('[THRIFT] Received reconnect token');
            reconnectTokenRef.current = msg.reconnectToken;
            reconnectSessionIdRef.current = msg.sessionId;
            break;
          }

          case 'PEER_RECONNECTING': {
            if (appStateRef.current !== APP_STATE.IDLE) {
              console.log('[THRIFT] Peer is reconnecting...');
              setAppState(APP_STATE.PEER_RECONNECTING);
            }
            break;
          }

          case 'RECONNECTED': {
            console.log('[THRIFT] Reconnection successful');
            setSessionData((prev) => ({
              ...prev,
              iceServers: msg.iceServers || prev.iceServers,
            }));
            setAppState(APP_STATE.WEBRTC_CONNECTING);
            break;
          }

          // ─── Local Discovery ───

          case 'LOCAL_SESSIONS': {
            console.log('[THRIFT] Local sessions found:', msg.count);
            setLocalSessions(msg.sessions || []);
            break;
          }

          // ─── Relay Fallback ───

          case 'RELAY_READY': {
            console.log('[THRIFT] Relay mode activated');
            setRelayMode(true);
            break;
          }

          case 'RELAY_REJECTED': {
            console.log('[THRIFT] Relay request rejected:', msg.reason);
            break;
          }

          case 'RELAY_ENDED': {
            console.log('[THRIFT] Relay mode ended:', msg.reason);
            setRelayMode(false);
            break;
          }

          case 'ERROR': {
            if (appStateRef.current !== APP_STATE.IDLE) {
              setAppState(APP_STATE.ERROR);
              setSessionData((prev) => ({ ...prev, errorMessage: msg.message }));
            } else {
              console.warn('[THRIFT] Non-fatal error while idle:', msg.message);
            }
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

      // If we have a reconnect token, attempt to reconnect
      if (reconnectTokenRef.current && reconnectSessionIdRef.current) {
        console.log('[THRIFT] WebSocket closed — will attempt reconnect...');
        setAppState(APP_STATE.RECONNECTING);

        // Auto-reconnect after a brief delay
        setTimeout(() => {
          connectWs();
        }, 1000);
      } else if (
        appStateRef.current !== APP_STATE.IDLE &&
        appStateRef.current !== APP_STATE.DISCONNECTED &&
        appStateRef.current !== APP_STATE.EXPIRED &&
        appStateRef.current !== APP_STATE.TIMED_OUT
      ) {
        if (sessionDataRef.current?.displayId) {
          setAppState(APP_STATE.DISCONNECTED);
        }
      }
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
      if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        socket.send(data);
      } else {
        socket.send(JSON.stringify(data));
      }
    } else {
      setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            wsRef.current.send(data);
          } else {
            wsRef.current.send(JSON.stringify(data));
          }
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

  const sendKeepAlive = useCallback(() => {
    send({ type: 'PING' });
  }, []);

  const setOnWebRtcSignal = useCallback((handler) => {
    onWebRtcSignalRef.current = handler;
  }, []);

  const setOnRelayData = useCallback((handler) => {
    onRelayDataRef.current = handler;
  }, []);

  const acceptConnection = useCallback(() => {
    send({ type: 'ACCEPT_CONNECTION' });
  }, []);

  const rejectConnection = useCallback(() => {
    send({ type: 'REJECT_CONNECTION' });
    setIncomingRequest(false);
    setAppState(APP_STATE.WAITING_FOR_DEVICE);
  }, []);

  // ─── Relay controls ───

  const requestRelay = useCallback(() => {
    send({ type: 'RELAY_REQUEST' });
  }, []);

  const sendRelayData = useCallback((binaryData) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(binaryData);
    }
  }, []);

  const endRelay = useCallback(() => {
    send({ type: 'RELAY_END' });
    setRelayMode(false);
  }, []);

  const disconnect = useCallback(() => {
    reconnectTokenRef.current = null;
    reconnectSessionIdRef.current = null;
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
    setLocalSessions([]);
    setRelayMode(false);
  }, []);

  return {
    appState,
    sessionData,
    incomingRequest,
    localSessions,
    relayMode,
    createSession,
    joinSession,
    acceptConnection,
    rejectConnection,
    sendWebRtcSignal,
    sendKeepAlive,
    setOnWebRtcSignal,
    setOnRelayData,
    requestRelay,
    sendRelayData,
    endRelay,
    disconnect,
    setAppState,
  };
}

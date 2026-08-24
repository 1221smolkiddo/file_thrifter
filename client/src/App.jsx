import React, { useEffect, useCallback } from 'react';
import { FaultyTerminal } from './components/Background/FaultyTerminal';
import { Navbar } from './components/Navigation/Navbar';
import { QRCodeDisplay } from './components/QR/QRCodeDisplay';
import { PairingModal } from './components/Connection/PairingModal';
import { FileDropArea } from './components/FileDrop/FileDropArea';
import { TransferVisualizer } from './components/Transfer/TransferVisualizer';
import { Home } from './pages/Home';
import { useWebSocketSession, APP_STATE } from './hooks/useWebSocketSession';
import { useWebRTC } from './hooks/useWebRTC';
import { useMockTransfer } from './hooks/useMockTransfer';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function App() {
  const {
    appState,
    sessionData,
    incomingRequest,
    transferPayload,
    createSession,
    joinSession,
    acceptConnection,
    rejectConnection,
    sendTransferMeta,
    sendTransferProgress,
    sendTransferComplete,
    sendWebRtcSignal,
    setOnWebRtcSignal,
    disconnect,
    setAppState,
  } = useWebSocketSession();

  const { startMockTransfer } = useMockTransfer({
    sendTransferMeta,
    sendTransferProgress,
    sendTransferComplete,
  });

  // ─── WebRTC Integration ───

  const shouldConnectWebRTC = appState === APP_STATE.WEBRTC_CONNECTING || appState === APP_STATE.CONNECTED;

  const handleWebRTCConnected = useCallback(() => {
    console.log('[THRIFT] WebRTC DataChannel verified — transitioning to CONNECTED');
    setAppState(APP_STATE.CONNECTED);
  }, [setAppState]);

  const handleWebRTCDisconnected = useCallback((state) => {
    console.log('[THRIFT] WebRTC disconnected:', state);
    // Only transition to disconnected if we were in a WebRTC-active state
    if ([APP_STATE.WEBRTC_CONNECTING, APP_STATE.CONNECTED, APP_STATE.TRANSFERRING].includes(appState)) {
      setAppState(APP_STATE.DISCONNECTED);
    }
  }, [appState, setAppState]);

  const handleWebRTCMessage = useCallback((data) => {
    // Future: handle file transfer messages here
    if (typeof data === 'string') {
      console.log('[THRIFT] DataChannel message received');
    }
  }, []);

  const {
    rtcState,
    dataChannelOpen,
    handleSignal,
    sendTestMessage,
    sendData,
    cleanup: cleanupWebRTC,
  } = useWebRTC({
    isHost: sessionData.isHost,
    iceServers: sessionData.iceServers,
    sendWsMessage: sendWebRtcSignal,
    shouldConnect: shouldConnectWebRTC,
    onConnected: handleWebRTCConnected,
    onDisconnected: handleWebRTCDisconnected,
    onMessage: handleWebRTCMessage,
  });

  // Register the WebRTC signal handler on the WebSocket session
  useEffect(() => {
    setOnWebRtcSignal(handleSignal);
    return () => setOnWebRtcSignal(null);
  }, [handleSignal, setOnWebRtcSignal]);

  // Expose test function globally in development
  useEffect(() => {
    if (import.meta.env.DEV) {
      window.__thriftSendTest = sendTestMessage;
      window.__thriftRtcState = rtcState;
      window.__thriftDataChannelOpen = dataChannelOpen;
      return () => {
        delete window.__thriftSendTest;
        delete window.__thriftRtcState;
        delete window.__thriftDataChannelOpen;
      };
    }
  }, [sendTestMessage, rtcState, dataChannelOpen]);

  // ─── Enhanced disconnect that also cleans up WebRTC ───

  const handleDisconnect = useCallback(() => {
    cleanupWebRTC();
    disconnect();
  }, [cleanupWebRTC, disconnect]);

  // Auto-join if URL contains ?session=...&token=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    const token = params.get('token');
    if (sessionId && token && appState === APP_STATE.IDLE) {
      console.log('[THRIFT] Auto-joining session from URL');
      joinSession(sessionId, token);
      // Clean the URL without reloading the page
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [appState, joinSession]);

  const handleFileSelected = (fileInfo) => {
    startMockTransfer(fileInfo);
  };

  const renderContent = () => {
    switch (appState) {
      case APP_STATE.IDLE:
      case APP_STATE.CREATING_SESSION:
      case APP_STATE.WAITING_FOR_DEVICE:
        return (
          <Home
            appState={appState}
            sessionData={sessionData}
            onCreateSession={createSession}
            onJoinSession={(sessionId, token) => joinSession(sessionId, token)}
          />
        );

      case APP_STATE.PAIRING:
        return (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }} className="mono">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--accent-lime)' }}>
              {sessionData.isHost ? 'WAITING FOR APPROVAL...' : 'CONNECTING TO HOST DEVICE...'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Verifying session token and establishing peer handshake
            </p>
          </div>
        );

      case APP_STATE.WEBRTC_CONNECTING:
        return (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }} className="mono">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--accent-lime)' }} className="animate-pulse-glow">
              ESTABLISHING ENCRYPTED P2P CHANNEL...
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Negotiating WebRTC DataChannel with peer
            </p>
          </div>
        );

      case APP_STATE.CONNECTED:
        return (
          <div style={{ width: '100%', padding: '1rem 0' }}>
            <FileDropArea onFileSelected={handleFileSelected} />
          </div>
        );

      case APP_STATE.TRANSFERRING:
      case APP_STATE.COMPLETED:
        return (
          <TransferVisualizer
            transferPayload={transferPayload}
            isHost={sessionData.isHost}
            onBlastAnother={handleDisconnect}
          />
        );

      case APP_STATE.EXPIRED:
      case APP_STATE.DISCONNECTED:
      case APP_STATE.ERROR:
        return (
          <div style={{
            maxWidth: '460px',
            margin: '2rem auto',
            padding: '2rem',
            background: 'var(--bg-surface)',
            border: '1px solid var(--accent-red)',
            borderRadius: '4px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}>
            <AlertTriangle size={40} style={{ color: 'var(--accent-red)' }} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
              {appState === APP_STATE.EXPIRED ? 'SESSION EXPIRED' : 'CONNECTION CLOSED'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {sessionData.errorMessage || 'The session was terminated or closed by peer. No data traces remain.'}
            </p>
            <button
              onClick={handleDisconnect}
              style={{
                background: 'var(--accent-lime)',
                color: '#08080a',
                padding: '0.75rem 1.5rem',
                fontWeight: 800,
                fontSize: '0.85rem',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '0.5rem',
              }}
            >
              <RefreshCw size={16} />
              START NEW SESSION
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <FaultyTerminal />
      <Navbar
        appState={appState}
        sessionData={sessionData}
        onDisconnect={handleDisconnect}
      />

      <main style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        position: 'relative',
        zIndex: 1,
      }}>
        {renderContent()}
      </main>

      {/* Host Incoming Pairing Confirmation Modal */}
      {incomingRequest && (
        <PairingModal
          onAccept={acceptConnection}
          onReject={rejectConnection}
        />
      )}
    </div>
  );
}

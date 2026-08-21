import React, { useEffect } from 'react';
import { FaultyTerminal } from './components/Background/FaultyTerminal';
import { Navbar } from './components/Navigation/Navbar';
import { QRCodeDisplay } from './components/QR/QRCodeDisplay';
import { PairingModal } from './components/Connection/PairingModal';
import { FileDropArea } from './components/FileDrop/FileDropArea';
import { TransferVisualizer } from './components/Transfer/TransferVisualizer';
import { Home } from './pages/Home';
import { useWebSocketSession, APP_STATE } from './hooks/useWebSocketSession';
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
    disconnect,
  } = useWebSocketSession();

  const { startMockTransfer } = useMockTransfer({
    sendTransferMeta,
    sendTransferProgress,
    sendTransferComplete,
  });

  // Auto-join if URL contains ?token=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || params.get('session');
    if (token && appState === APP_STATE.IDLE) {
      console.log('[THRIFT] Auto-joining session token from URL:', token);
      joinSession(token);
    }
  }, [appState, joinSession]);

  const handleFileSelected = (fileInfo) => {
    startMockTransfer(fileInfo);
  };

  const renderContent = () => {
    switch (appState) {
      case APP_STATE.IDLE:
        return (
          <Home
            onCreateSession={createSession}
            onJoinSession={(token) => joinSession(token)}
          />
        );

      case APP_STATE.CREATING_SESSION:
        return (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }} className="mono">
            <p style={{ color: 'var(--accent-cyan)' }} className="animate-pulse-glow">
              GENERATING CRYPTOGRAPHIC SESSION...
            </p>
          </div>
        );

      case APP_STATE.WAITING_FOR_DEVICE:
        return <QRCodeDisplay sessionData={sessionData} />;

      case APP_STATE.PAIRING:
        return (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }} className="mono">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--accent-cyan)' }}>
              {sessionData.isHost ? 'WAITING FOR APPROVAL...' : 'CONNECTING TO HOST DEVICE...'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Verifying session token and establishing peer handshake
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
            onBlastAnother={disconnect}
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
              onClick={disconnect}
              style={{
                background: 'var(--accent-cyan)',
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
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <FaultyTerminal />
      <Navbar
        appState={appState}
        sessionData={sessionData}
        onDisconnect={disconnect}
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

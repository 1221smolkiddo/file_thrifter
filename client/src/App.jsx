import React, { useEffect, useCallback, useRef, useState } from 'react';
import { FaultyTerminal } from './components/Background/FaultyTerminal';
import { Navbar } from './components/Navigation/Navbar';
import { PairingModal } from './components/Connection/PairingModal';
import { FileDropArea } from './components/FileDrop/FileDropArea';
import { TransferVisualizer } from './components/Transfer/TransferVisualizer';
import { Home } from './pages/Home';
import { useWebSocketSession, APP_STATE } from './hooks/useWebSocketSession';
import { useWebRTC } from './hooks/useWebRTC';
import { DATA_MESSAGE_TYPE } from './lib/webrtc/constants';
import { createRoleMessage, parseDataMessage } from './lib/webrtc/messages';
import { AlertTriangle, Inbox, RefreshCw, Send } from 'lucide-react';

export default function App() {
  const {
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
  } = useWebSocketSession();

  const [transferPayload, setTransferPayload] = useState(null);
  const [p2pNotice, setP2pNotice] = useState('');
  const [transferRole, setTransferRole] = useState(null);
  const incomingFileRef = useRef(null);
  const downloadUrlRef = useRef(null);

  const beginFileTransfer = useCallback((fileInfo) => {
    setTransferPayload({
      fileInfo,
      transferredBytes: 0,
      totalBytes: fileInfo.size,
      percentage: 0,
      speedBps: 0,
      speedMbps: '0.0',
      status: 'SENDING',
    });
    setAppState(APP_STATE.TRANSFERRING);
  }, [setAppState]);

  const updateFileTransfer = useCallback((transferredBytes, totalBytes) => {
    setTransferPayload((previous) => ({
      ...previous,
      transferredBytes,
      totalBytes,
      percentage: Math.min(100, Math.round((transferredBytes / totalBytes) * 100)),
      speedBps: 0,
      speedMbps: '0.0',
      status: 'SENDING',
    }));
  }, []);

  const completeFileTransfer = useCallback(() => {
    setTransferPayload((previous) => ({
      ...previous,
      percentage: 100,
      status: 'COMPLETED',
    }));
    setAppState(APP_STATE.COMPLETED);
  }, [setAppState]);

  // ─── WebRTC Integration ───

  // The transfer views are still part of the same P2P session. Do not tear
  // down the DataChannel merely because the UI advances past CONNECTED.
  const shouldConnectWebRTC = [
    APP_STATE.WEBRTC_CONNECTING,
    APP_STATE.ROLE_SELECTION,
    APP_STATE.CONNECTED,
    APP_STATE.TRANSFERRING,
    APP_STATE.COMPLETED,
  ].includes(appState);

  const handleWebRTCConnected = useCallback(() => {
    console.log('[THRIFT] WebRTC DataChannel verified — choose a transfer role');
    setAppState(APP_STATE.ROLE_SELECTION);
  }, [setAppState]);

  const handleWebRTCDisconnected = useCallback((state) => {
    console.log('[THRIFT] WebRTC disconnected:', state);
    // Only transition to disconnected if we were in a WebRTC-active state
    if ([APP_STATE.WEBRTC_CONNECTING, APP_STATE.ROLE_SELECTION, APP_STATE.CONNECTED, APP_STATE.TRANSFERRING, APP_STATE.COMPLETED].includes(appState)) {
      setAppState(APP_STATE.DISCONNECTED);
    }
  }, [appState, setAppState]);

  const showCompletedText = useCallback((text, status) => {
    const size = new TextEncoder().encode(text).byteLength;
    setTransferPayload({
      fileInfo: {
        name: 'pasted_text.txt',
        size,
        type: 'text/plain',
        content: text,
      },
      transferredBytes: size,
      totalBytes: size,
      percentage: 100,
      speedBps: 0,
      speedMbps: '0.0',
      status,
    });
    setAppState(APP_STATE.COMPLETED);
  }, [setAppState]);

  const handleWebRTCMessage = useCallback((data) => {
    if (data instanceof ArrayBuffer) {
      const incoming = incomingFileRef.current;
      if (!incoming) return;

      incoming.chunks.push(data);
      incoming.transferredBytes += data.byteLength;
      setTransferPayload((previous) => ({
        ...previous,
        transferredBytes: incoming.transferredBytes,
        percentage: Math.min(100, Math.round((incoming.transferredBytes / incoming.fileInfo.size) * 100)),
        status: 'RECEIVING',
      }));
      return;
    }

    const message = parseDataMessage(data);
    if (!message) return;

    switch (message.type) {
      case DATA_MESSAGE_TYPE.TEXT:
        console.log('[THRIFT] Text received through DataChannel');
        showCompletedText(message.payload, 'RECEIVING');
        break;
      case DATA_MESSAGE_TYPE.ROLE: {
        const assignedRole = message.payload.role === 'SENDER' ? 'RECEIVER' : 'SENDER';
        setTransferRole((currentRole) => {
          if (currentRole && currentRole !== assignedRole) {
            // The host's choice is authoritative when both peers select at
            // once; the guest adopts it on receiving the host's role message.
            if (sessionData.isHost) {
              setP2pNotice('Both devices selected a role at once. Using this device\'s selection.');
              return currentRole;
            }
          }
          return assignedRole;
        });
        setAppState(APP_STATE.CONNECTED);
        break;
      }
      case DATA_MESSAGE_TYPE.FILE_OFFER: {
        const fileInfo = message.payload;
        incomingFileRef.current = {
          id: message.id,
          fileInfo,
          chunks: [],
          transferredBytes: 0,
        };
        setTransferPayload({
          fileInfo,
          transferredBytes: 0,
          totalBytes: fileInfo.size,
          percentage: 0,
          speedBps: 0,
          speedMbps: '0.0',
          status: 'RECEIVING',
        });
        setAppState(APP_STATE.TRANSFERRING);
        break;
      }
      case DATA_MESSAGE_TYPE.FILE_COMPLETE: {
        const incoming = incomingFileRef.current;
        if (!incoming || incoming.id !== message.id) return;

        if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
        const downloadUrl = URL.createObjectURL(new Blob(incoming.chunks, { type: incoming.fileInfo.type }));
        downloadUrlRef.current = downloadUrl;
        incomingFileRef.current = null;
        setTransferPayload((previous) => ({
          ...previous,
          transferredBytes: incoming.transferredBytes,
          percentage: 100,
          status: 'COMPLETED',
          downloadUrl,
        }));
        setAppState(APP_STATE.COMPLETED);
        break;
      }
      default:
        break;
    }
  }, [sessionData.isHost, showCompletedText, setAppState]);

  const {
    rtcState,
    dataChannelOpen,
    handleSignal,
    sendTestMessage,
    sendData,
    sendText,
    sendFile,
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

  const handleTransferRole = useCallback((role) => {
    if (!dataChannelOpen || !sendData(createRoleMessage(role))) {
      setP2pNotice('P2P connection not ready.');
      return;
    }

    setTransferRole(role);
    setP2pNotice('');
    setAppState(APP_STATE.CONNECTED);
  }, [dataChannelOpen, sendData, setAppState]);

  const handleFileSelected = useCallback(async (file) => {
    if (transferRole !== 'SENDER' || !dataChannelOpen) {
      setP2pNotice('Choose Send files after the P2P connection is ready.');
      return;
    }

    setP2pNotice('');
    const sent = await sendFile(file, {
      onStart: beginFileTransfer,
      onProgress: updateFileTransfer,
      onComplete: completeFileTransfer,
    });

    if (!sent) {
      setP2pNotice('File transfer stopped because the P2P connection is no longer ready.');
      setAppState(APP_STATE.CONNECTED);
    }
  }, [beginFileTransfer, completeFileTransfer, dataChannelOpen, sendFile, setAppState, transferRole, updateFileTransfer]);

  const handleTextSend = useCallback((text) => {
    if (transferRole !== 'SENDER' || !dataChannelOpen || !sendText(text)) {
      setP2pNotice('Choose Send files after the P2P connection is ready.');
      return false;
    }

    setP2pNotice('');
    showCompletedText(text, 'SENDING');
    return true;
  }, [dataChannelOpen, sendText, showCompletedText, transferRole]);

  const handleAnotherTransfer = useCallback(() => {
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
    setTransferPayload(null);
    setP2pNotice('');
    setAppState(APP_STATE.CONNECTED);
  }, [setAppState]);

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

      case APP_STATE.ROLE_SELECTION:
        return (
          <div style={{ width: '100%', maxWidth: '620px', textAlign: 'center' }} className="mono">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: 'var(--accent-lime)' }}>
              P2P CONNECTION READY
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '2rem' }}>
              Choose one device to send and the other to receive.
            </p>
            {p2pNotice && <p role="alert" style={{ color: 'var(--accent-red)', fontSize: '0.8rem' }}>{p2pNotice}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <button onClick={() => handleTransferRole('SENDER')} style={{ padding: '1.5rem', background: 'var(--text-primary)', color: 'var(--bg-primary)', fontWeight: 800, borderRadius: '2px' }}>
                <Send size={22} style={{ marginBottom: '0.5rem' }} /><br />SEND FILES
              </button>
              <button onClick={() => handleTransferRole('RECEIVER')} style={{ padding: '1.5rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--bg-surface-border)', fontWeight: 800, borderRadius: '2px' }}>
                <Inbox size={22} style={{ marginBottom: '0.5rem' }} /><br />RECEIVE FILES
              </button>
            </div>
          </div>
        );

      case APP_STATE.CONNECTED:
        return transferRole === 'SENDER' ? (
          <div style={{ width: '100%', padding: '1rem 0' }}>
            <FileDropArea
              onFileSelected={handleFileSelected}
              onTextSend={handleTextSend}
              p2pNotice={p2pNotice}
            />
          </div>
        ) : (
          <div style={{ maxWidth: '460px', textAlign: 'center' }} className="mono">
            <Inbox size={40} style={{ color: 'var(--accent-lime)', marginBottom: '1rem' }} />
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>READY TO RECEIVE</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Waiting securely for the sender to choose a file.
            </p>
          </div>
        );

      case APP_STATE.TRANSFERRING:
      case APP_STATE.COMPLETED:
        return (
          <TransferVisualizer
            transferPayload={transferPayload}
            isHost={sessionData.isHost}
            onBlastAnother={handleAnotherTransfer}
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

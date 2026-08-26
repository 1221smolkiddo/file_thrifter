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
import { createRoleMessage, createTransferAckMessage, parseDataMessage } from './lib/webrtc/messages';
import { AlertTriangle, Inbox, RefreshCw, Send } from 'lucide-react';
import { BorderGlow } from './components/Common/BorderGlow';

export default function App() {
  const {
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
    disconnect,
    setAppState,
  } = useWebSocketSession();

  const [transferPayload, setTransferPayload] = useState(null);
  const [p2pNotice, setP2pNotice] = useState('');
  const [transferRole, setTransferRole] = useState(null);
  const incomingBatchRef = useRef(null);
  const incomingFileRef = useRef(null);
  const downloadUrlsRef = useRef([]);
  const sendDataRef = useRef(null);
  const lastReceiverUpdateRef = useRef(0);
  const lastReceiverBytesRef = useRef(0);
  const receiverSpeedMbpsRef = useRef('0.0');

  const revokeDownloadUrls = useCallback(() => {
    if (downloadUrlsRef.current && downloadUrlsRef.current.length > 0) {
      downloadUrlsRef.current.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch {}
      });
      downloadUrlsRef.current = [];
    }
  }, []);

  const showTransferError = useCallback((errorMessage) => {
    setTransferPayload((previous) => ({
      ...previous,
      status: 'ERROR',
      errorMessage,
    }));
    setAppState(APP_STATE.TRANSFER_ERROR);
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
    if (appState === APP_STATE.TRANSFERRING) {
      showTransferError('P2P connection closed before the file transfer completed.');
    } else if ([APP_STATE.WEBRTC_CONNECTING, APP_STATE.ROLE_SELECTION, APP_STATE.CONNECTED, APP_STATE.COMPLETED].includes(appState)) {
      setAppState(APP_STATE.DISCONNECTED);
    }
  }, [appState, setAppState, showTransferError]);

  const handleWebRTCError = useCallback((error) => {
    const message = error instanceof Error ? error.message : 'The P2P connection reported an error.';
    showTransferError(message);
  }, [showTransferError]);

  const showCompletedText = useCallback((text, status) => {
    const isLink = /^(?:https?:\/\/|www\.)[^\s]+$/i.test(text.trim());
    const size = new TextEncoder().encode(text).byteLength;
    setTransferPayload({
      isBatch: false,
      fileInfo: {
        name: isLink ? 'shared_link.url' : 'pasted_text.txt',
        size,
        type: isLink ? 'text/uri-list' : 'text/plain',
        content: text,
        isLink,
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

      // Consolidate raw ArrayBuffers into Blob sub-parts every 16 MB (256 chunks of 64KB)
      if (incoming.chunks.length >= 256) {
        if (!incoming.blobParts) incoming.blobParts = [];
        incoming.blobParts.push(new Blob(incoming.chunks));
        incoming.chunks = [];
      }

      const now = performance.now();
      if (now - lastReceiverUpdateRef.current >= 100) {
        const batch = incomingBatchRef.current;
        const completedBytes = batch ? batch.completedBytes : 0;
        const overallTransferred = completedBytes + incoming.transferredBytes;
        const totalBytes = batch ? batch.totalBytes : incoming.fileInfo.size;
        const overallPercentage = totalBytes > 0 ? Math.min(100, Math.round((overallTransferred / totalBytes) * 100)) : 100;
        const filePercentage = incoming.fileInfo.size > 0 ? Math.min(100, Math.round((incoming.transferredBytes / incoming.fileInfo.size) * 100)) : 100;

        const elapsed = now - lastReceiverUpdateRef.current;
        if (elapsed > 0) {
          const bytesDelta = overallTransferred - lastReceiverBytesRef.current;
          receiverSpeedMbpsRef.current = ((bytesDelta / elapsed) * 1000 / (1024 * 1024)).toFixed(1);
          lastReceiverBytesRef.current = overallTransferred;
        }
        lastReceiverUpdateRef.current = now;

        setTransferPayload((previous) => {
          if (!previous) return previous;
          const updatedFiles = (previous.files || []).map((f, idx) => {
            if (idx === incoming.fileIndex || f.id === incoming.id) {
              return {
                ...f,
                transferredBytes: incoming.transferredBytes,
                percentage: filePercentage,
                status: 'TRANSFERRING',
              };
            }
            return f;
          });

          return {
            ...previous,
            transferredBytes: overallTransferred,
            percentage: overallPercentage,
            speedMbps: receiverSpeedMbpsRef.current,
            status: 'RECEIVING',
            activeFileIndex: incoming.fileIndex,
            currentFile: {
              ...incoming.fileInfo,
              transferredBytes: incoming.transferredBytes,
              percentage: filePercentage,
            },
            files: updatedFiles,
          };
        });
      }
      return;
    }

    const message = parseDataMessage(data);
    if (!message) return;

    switch (message.type) {
      case DATA_MESSAGE_TYPE.TEXT:
        console.log('[THRIFT] Text received through DataChannel');
        showCompletedText(message.payload, 'RECEIVED');
        break;

      case DATA_MESSAGE_TYPE.ROLE: {
        const assignedRole = message.payload.role === 'SENDER' ? 'RECEIVER' : 'SENDER';
        setTransferRole((currentRole) => {
          if (currentRole && currentRole !== assignedRole) {
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

      case DATA_MESSAGE_TYPE.BATCH_OFFER: {
        const { batchId, totalFiles, totalBytes, files: offerFiles } = message.payload;
        incomingBatchRef.current = {
          batchId,
          totalFiles,
          totalBytes,
          completedBytes: 0,
          files: offerFiles.map((f) => ({
            ...f,
            status: 'QUEUED',
            transferredBytes: 0,
            percentage: 0,
          })),
        };

        setTransferPayload({
          isBatch: true,
          batchId,
          totalFiles,
          totalBytes,
          transferredBytes: 0,
          percentage: 0,
          speedMbps: '0.0',
          status: 'RECEIVING',
          activeFileIndex: 0,
          files: offerFiles.map((f) => ({
            ...f,
            status: 'QUEUED',
            transferredBytes: 0,
            percentage: 0,
          })),
        });
        setAppState(APP_STATE.TRANSFERRING);
        break;
      }

      case DATA_MESSAGE_TYPE.FILE_OFFER: {
        const fileInfo = message.payload;
        const fileIndex = Number.isInteger(fileInfo.fileIndex) ? fileInfo.fileIndex : 0;
        const totalFiles = Number.isInteger(fileInfo.totalFiles) ? fileInfo.totalFiles : 1;

        incomingFileRef.current = {
          id: message.id,
          batchId: fileInfo.batchId,
          fileIndex,
          totalFiles,
          fileInfo: {
            id: message.id,
            name: fileInfo.name,
            size: fileInfo.size,
            type: fileInfo.type || 'application/octet-stream',
          },
          chunks: [],
          blobParts: [],
          transferredBytes: 0,
        };

        setTransferPayload((previous) => {
          if (!previous || !previous.isBatch) {
            // Single file offer
            return {
              isBatch: false,
              fileInfo: {
                id: message.id,
                name: fileInfo.name,
                size: fileInfo.size,
                type: fileInfo.type,
              },
              totalFiles: 1,
              totalBytes: fileInfo.size,
              transferredBytes: 0,
              percentage: 0,
              speedMbps: '0.0',
              status: 'RECEIVING',
              files: [{
                id: message.id,
                name: fileInfo.name,
                size: fileInfo.size,
                type: fileInfo.type,
                status: 'TRANSFERRING',
                transferredBytes: 0,
                percentage: 0,
              }],
            };
          }

          // Part of existing batch
          const updatedFiles = (previous.files || []).map((f, idx) => {
            if (idx === fileIndex || f.id === message.id) {
              return { ...f, status: 'TRANSFERRING' };
            }
            return f;
          });

          return {
            ...previous,
            activeFileIndex: fileIndex,
            currentFile: {
              id: message.id,
              name: fileInfo.name,
              size: fileInfo.size,
              type: fileInfo.type,
              transferredBytes: 0,
              percentage: 0,
            },
            files: updatedFiles,
            status: 'RECEIVING',
          };
        });

        setAppState(APP_STATE.TRANSFERRING);
        break;
      }

      case DATA_MESSAGE_TYPE.FILE_COMPLETE: {
        const incoming = incomingFileRef.current;
        if (!incoming || incoming.id !== message.id) return;

        const allParts = incoming.blobParts && incoming.blobParts.length > 0
          ? [...incoming.blobParts, ...incoming.chunks]
          : incoming.chunks;
        const blob = new Blob(allParts, { type: incoming.fileInfo.type });
        incoming.blobParts = [];
        incoming.chunks = [];
        const downloadUrl = URL.createObjectURL(blob);
        downloadUrlsRef.current.push(downloadUrl);

        const batch = incomingBatchRef.current;
        const now = Date.now();
        if (batch) {
          batch.completedBytes += incoming.transferredBytes;
          if (batch.files && batch.files[incoming.fileIndex]) {
            batch.files[incoming.fileIndex] = {
              ...batch.files[incoming.fileIndex],
              status: 'COMPLETED',
              blob,
              downloadUrl,
              transferredBytes: incoming.transferredBytes,
              percentage: 100,
              completedAt: now,
            };
          }
        }

        // Send transfer ACK to sender
        sendDataRef.current?.(createTransferAckMessage(message.id, {
          batchId: incoming.batchId,
          fileIndex: incoming.fileIndex,
        }));

        setTransferPayload((previous) => {
          if (!previous) return previous;

          if (!previous.isBatch) {
            // Single file complete
            return {
              ...previous,
              transferredBytes: incoming.transferredBytes,
              percentage: 100,
              status: 'RECEIVED',
              downloadUrl,
              blob,
              files: [{
                ...previous.fileInfo,
                status: 'COMPLETED',
                blob,
                downloadUrl,
                transferredBytes: incoming.transferredBytes,
                percentage: 100,
                completedAt: now,
              }],
            };
          }

          const updatedFiles = (previous.files || []).map((f, idx) => {
            if (idx === incoming.fileIndex || f.id === incoming.id) {
              return {
                ...f,
                status: 'COMPLETED',
                blob,
                downloadUrl,
                transferredBytes: incoming.transferredBytes,
                percentage: 100,
                completedAt: now,
              };
            }
            return f;
          });

          return {
            ...previous,
            files: updatedFiles,
          };
        });

        incomingFileRef.current = null;

        // If it was a single file (not part of multi-file batch), mark COMPLETED
        if (!batch || batch.totalFiles <= 1) {
          setAppState(APP_STATE.COMPLETED);
        }
        break;
      }

      case DATA_MESSAGE_TYPE.BATCH_COMPLETE: {
        incomingBatchRef.current = null;
        incomingFileRef.current = null;
        setTransferPayload((previous) => ({
          ...previous,
          percentage: 100,
          status: 'RECEIVED',
        }));
        setAppState(APP_STATE.COMPLETED);
        break;
      }

      case DATA_MESSAGE_TYPE.TRANSFER_CANCEL: {
        console.log('[THRIFT] Transfer cancelled by peer');
        revokeDownloadUrls();
        incomingFileRef.current = null;
        incomingBatchRef.current = null;
        setTransferPayload(null);
        setP2pNotice(transferRole === 'SENDER' ? 'Receiver stopped the transfer' : 'Sender stopped the transfer');
        setAppState(APP_STATE.CONNECTED);
        break;
      }

      case DATA_MESSAGE_TYPE.TRANSFER_ACK:
        setTransferPayload((previous) => {
          if (!previous) return previous;
          const updatedFiles = (previous.files || []).map((f) => {
            if (f.id === message.id) {
              return { ...f, status: 'COMPLETED', percentage: 100 };
            }
            return f;
          });
          return {
            ...previous,
            files: updatedFiles,
          };
        });
        break;

      default:
        break;
    }
  }, [sessionData.isHost, showCompletedText, setAppState, revokeDownloadUrls, transferRole]);

  const {
    rtcState,
    dataChannelOpen,
    handleSignal,
    sendTestMessage,
    sendData,
    sendText,
    sendFiles,
    cancelTransfer,
    cleanup: cleanupWebRTC,
  } = useWebRTC({
    isHost: sessionData.isHost,
    iceServers: sessionData.iceServers,
    sendWsMessage: sendWebRtcSignal,
    shouldConnect: shouldConnectWebRTC,
    relayMode,
    requestRelay,
    sendRelayData,
    onConnected: handleWebRTCConnected,
    onDisconnected: handleWebRTCDisconnected,
    onMessage: handleWebRTCMessage,
    onError: handleWebRTCError,
  });

  // Connect WebSocket relay binary stream to WebRTC message handler
  useEffect(() => {
    setOnRelayData((data) => {
      handleWebRTCMessage(data);
    });
    return () => setOnRelayData(null);
  }, [handleWebRTCMessage, setOnRelayData]);

  useEffect(() => {
    sendDataRef.current = sendData;
  }, [sendData]);

  // Transfers are P2P, but a control-only keep-alive prevents the signaling
  // session's inactivity timer from expiring while either peer is busy.
  useEffect(() => {
    if (appState !== APP_STATE.TRANSFERRING) return undefined;

    sendKeepAlive();
    const interval = setInterval(sendKeepAlive, 20_000);
    return () => clearInterval(interval);
  }, [appState, sendKeepAlive]);

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

  // ─── Enhanced disconnect that also cleans up WebRTC & Blobs ───

  const handleDisconnect = useCallback(() => {
    revokeDownloadUrls();
    cleanupWebRTC();
    disconnect();
  }, [cleanupWebRTC, disconnect, revokeDownloadUrls]);

  // Auto-join if URL contains ?session=...&token=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    const token = params.get('token');
    if (sessionId && token && appState === APP_STATE.IDLE) {
      console.log('[THRIFT] Auto-joining session from URL');
      joinSession(sessionId, token);
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

  const handleFilesSelected = useCallback(async (files) => {
    if (transferRole !== 'SENDER' || !dataChannelOpen) {
      setP2pNotice('Choose Send files after the P2P connection is ready.');
      return;
    }

    setP2pNotice('');

    const sent = await sendFiles(files, {
      onBatchStart: ({ batchId, totalFiles, totalBytes, files: batchFiles }) => {
        setTransferPayload({
          isBatch: totalFiles > 1,
          batchId,
          totalFiles,
          totalBytes,
          transferredBytes: 0,
          percentage: 0,
          speedMbps: '0.0',
          status: 'SENDING',
          activeFileIndex: 0,
          files: batchFiles.map((f) => ({
            ...f,
            status: 'QUEUED',
            transferredBytes: 0,
            percentage: 0,
          })),
        });
        setAppState(APP_STATE.TRANSFERRING);
      },
      onFileStart: ({ id, name, size, type, fileIndex }) => {
        setTransferPayload((previous) => {
          if (!previous) return previous;
          const updatedFiles = (previous.files || []).map((f, idx) => {
            if (idx === fileIndex || f.id === id) {
              return { ...f, status: 'TRANSFERRING' };
            }
            return f;
          });
          return {
            ...previous,
            activeFileIndex: fileIndex,
            currentFile: { id, name, size, type },
            files: updatedFiles,
          };
        });
      },
      onProgress: ({ fileIndex, fileTransferredBytes, overallTransferredBytes, totalBatchBytes, speedMbps, filePercentage, overallPercentage }) => {
        setTransferPayload((previous) => {
          if (!previous) return previous;
          const updatedFiles = (previous.files || []).map((f, idx) => {
            if (idx === fileIndex) {
              return {
                ...f,
                transferredBytes: fileTransferredBytes,
                percentage: filePercentage,
                status: 'TRANSFERRING',
              };
            }
            return f;
          });
          return {
            ...previous,
            transferredBytes: overallTransferredBytes,
            totalBytes: totalBatchBytes,
            percentage: overallPercentage,
            speedMbps,
            files: updatedFiles,
          };
        });
      },
      onFileComplete: ({ fileIndex }) => {
        const now = Date.now();
        setTransferPayload((previous) => {
          if (!previous) return previous;
          const updatedFiles = (previous.files || []).map((f, idx) => {
            if (idx === fileIndex) {
              return { ...f, status: 'COMPLETED', percentage: 100, completedAt: now };
            }
            return f;
          });
          return {
            ...previous,
            files: updatedFiles,
          };
        });
      },
      onBatchComplete: () => {
        setTransferPayload((previous) => ({
          ...previous,
          percentage: 100,
          status: 'SENT',
        }));
        setAppState(APP_STATE.COMPLETED);
      },
      onError: (error) => showTransferError(error.message),
    });

    if (!sent) {
      showTransferError('File transfer could not be completed over the P2P connection.');
    }
  }, [dataChannelOpen, sendFiles, showTransferError, transferRole, setAppState]);

  const handleTextSend = useCallback((text) => {
    if (transferRole !== 'SENDER' || !dataChannelOpen || !sendText(text)) {
      setP2pNotice('Choose Send files after the P2P connection is ready.');
      return false;
    }

    setP2pNotice('');
    showCompletedText(text, 'SENT');
    return true;
  }, [dataChannelOpen, sendText, showCompletedText, transferRole]);

  const handleAnotherTransfer = useCallback(() => {
    revokeDownloadUrls();
    setTransferPayload(null);
    setP2pNotice('');
    setAppState(APP_STATE.CONNECTED);
  }, [revokeDownloadUrls, setAppState]);

  const handleCancelTransfer = useCallback(() => {
    cancelTransfer();
    revokeDownloadUrls();
    incomingFileRef.current = null;
    incomingBatchRef.current = null;
    setTransferPayload(null);
    setP2pNotice('Transfer stopped.');
    setAppState(APP_STATE.CONNECTED);
  }, [cancelTransfer, revokeDownloadUrls, setAppState]);

  const renderContent = () => {

    switch (appState) {
      case APP_STATE.IDLE:
      case APP_STATE.CREATING_SESSION:
      case APP_STATE.WAITING_FOR_DEVICE:
        return (
          <Home
            appState={appState}
            sessionData={sessionData}
            localSessions={localSessions}
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
              <BorderGlow
                as="button"
                onClick={() => handleTransferRole('SENDER')}
                glowColor="var(--accent-lime)"
                backgroundColor="var(--text-primary)"
                alwaysActive={true}
                speed={3}
                style={{ width: '100%' }}
              >
                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '100%', color: 'var(--bg-primary)', fontWeight: 800 }}>
                  <Send size={24} className="icon-arrow" />
                  <span>SEND FILES</span>
                </div>
              </BorderGlow>
              <BorderGlow
                as="button"
                onClick={() => handleTransferRole('RECEIVER')}
                glowColor="var(--accent-lime)"
                secondaryColor="#ffffff"
                backgroundColor="var(--bg-surface)"
                pointerTracked={true}
                style={{ width: '100%' }}
              >
                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '100%', color: 'var(--text-primary)', fontWeight: 800 }}>
                  <Inbox size={24} className="icon-download" />
                  <span>RECEIVE FILES</span>
                </div>
              </BorderGlow>
            </div>
          </div>
        );

      case APP_STATE.CONNECTED:
        return transferRole === 'SENDER' ? (
          <div style={{ width: '100%', padding: '1rem 0' }}>
            <FileDropArea
              onFileSelected={handleFilesSelected}
              onFilesSelected={handleFilesSelected}
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
      case APP_STATE.TRANSFER_ERROR:
        return (
          <TransferVisualizer
            transferPayload={transferPayload}
            isHost={sessionData.isHost}
            transferRole={transferRole}
            onBlastAnother={handleAnotherTransfer}
            onCancelTransfer={handleCancelTransfer}
          />
        );

      case APP_STATE.EXPIRED:
      case APP_STATE.TIMED_OUT:
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
          }} className="animate-slide-up">
            <AlertTriangle size={40} style={{ color: 'var(--accent-red)' }} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
              {appState === APP_STATE.EXPIRED ? 'SESSION EXPIRED' : appState === APP_STATE.TIMED_OUT ? 'CONNECTION TIMED OUT' : 'CONNECTION CLOSED'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {sessionData.errorMessage || 'The session was terminated or closed by peer. No data traces remain.'}
            </p>
            <BorderGlow
              as="button"
              onClick={handleDisconnect}
              glowColor="var(--accent-lime)"
              backgroundColor="var(--accent-lime)"
              alwaysActive={true}
              speed={2.6}
            >
              <div style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem', fontWeight: 800, color: 'var(--bg-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <RefreshCw size={16} className="icon-zap" />
                START NEW SESSION
              </div>
            </BorderGlow>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
        padding: '1rem',
        position: 'relative',
        zIndex: 1,
        overflowY: 'auto',
        minHeight: 0,
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

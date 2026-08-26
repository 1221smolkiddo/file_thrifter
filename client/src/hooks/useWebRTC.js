// client/src/hooks/useWebRTC.js
// React hook that manages the WebRTC DataChannel lifecycle for THRIFT.
// Bridges the signaling WebSocket with the RTCPeerConnection engine.
// Handles React StrictMode by preventing duplicate connections.
// Supports automatic relay fallback when WebRTC DataChannel fails.

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPeerConnection } from '../lib/webrtc/createPeerConnection.js';
import { RTC_STATE } from '../lib/webrtc/constants.js';
import {
  createBatchCompleteMessage,
  createBatchOfferMessage,
  createFileCompleteMessage,
  createFileOffer,
  createTextMessage,
} from '../lib/webrtc/messages.js';


const FILE_CHUNK_BYTES = 64 * 1024; // 64 KB network chunk size
const DISK_BLOCK_BYTES = 2 * 1024 * 1024; // 2 MB disk read block
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024; // 4 MB send buffer high-water mark
const BUFFERED_AMOUNT_LOW_THRESHOLD = 512 * 1024; // 512 KB low-water mark
const WEBRTC_FAILURE_TIMEOUT_MS = 15_000; // 15s to establish WebRTC before fallback

function waitForBufferDrain(channel) {
  if (!channel || channel.readyState !== 'open' || channel.bufferedAmount <= BUFFERED_AMOUNT_LOW_THRESHOLD) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let resolved = false;
    let pollInterval = null;

    const cleanup = () => {
      resolved = true;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      try {
        channel.removeEventListener('bufferedamountlow', onDrain);
        channel.removeEventListener('close', onDrain);
        channel.removeEventListener('error', onDrain);
      } catch {}
    };

    const onDrain = () => {
      if (!resolved) {
        cleanup();
        resolve();
      }
    };

    const checkDrain = () => {
      if (channel.readyState !== 'open' || channel.bufferedAmount <= BUFFERED_AMOUNT_LOW_THRESHOLD) {
        onDrain();
      }
    };

    try {
      channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
      channel.addEventListener('bufferedamountlow', onDrain, { once: true });
      channel.addEventListener('close', onDrain, { once: true });
      channel.addEventListener('error', onDrain, { once: true });
    } catch {}

    pollInterval = setInterval(checkDrain, 10);
  });
}

/**
 * useWebRTC — Manages a WebRTC DataChannel connection.
 *
 * @param {object} options
 * @param {boolean} options.isHost - Whether this peer is the session host
 * @param {object[]|null} options.iceServers - ICE server config from SESSION_CONNECTED
 * @param {function} options.sendWsMessage - Function to send messages via WebSocket
 * @param {boolean} options.shouldConnect - Whether to initiate the WebRTC connection
 * @param {boolean} [options.relayMode] - Whether relay mode is active
 * @param {function} [options.requestRelay] - Function to request relay fallback
 * @param {function} [options.sendRelayData] - Function to send data via relay
 * @param {function} [options.onConnected] - Called when DataChannel is verified open
 * @param {function} [options.onDisconnected] - Called when DataChannel/peer connection is lost
 * @param {function} [options.onMessage] - Called when a message is received through DataChannel
 * @param {function} [options.onError] - Called when WebRTC or DataChannel reports an error
 *
 * @returns {object} WebRTC state and controls
 */
export function useWebRTC({
  isHost,
  iceServers,
  sendWsMessage,
  shouldConnect,
  relayMode = false,
  requestRelay,
  sendRelayData,
  onConnected,
  onDisconnected,
  onMessage,
  onError,
}) {
  const [rtcState, setRtcState] = useState(RTC_STATE.NEW);
  const [dataChannelOpen, setDataChannelOpen] = useState(false);
  const [isRelayFallback, setIsRelayFallback] = useState(false);

  const peerRef = useRef(null);
  const destroyedRef = useRef(false);
  const failureTimerRef = useRef(null);

  // Store latest callbacks in refs to avoid stale closures
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const sendWsMessageRef = useRef(sendWsMessage);
  const requestRelayRef = useRef(requestRelay);
  const sendRelayDataRef = useRef(sendRelayData);

  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);
  useEffect(() => { onDisconnectedRef.current = onDisconnected; }, [onDisconnected]);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { sendWsMessageRef.current = sendWsMessage; }, [sendWsMessage]);
  useEffect(() => { requestRelayRef.current = requestRelay; }, [requestRelay]);
  useEffect(() => { sendRelayDataRef.current = sendRelayData; }, [sendRelayData]);

  // ─── Handle relay mode activation ───

  useEffect(() => {
    if (relayMode && !dataChannelOpen) {
      console.log('[THRIFT:RTC] Relay mode activated — using WebSocket relay');
      setIsRelayFallback(true);
      setDataChannelOpen(true);
      setRtcState(RTC_STATE.CONNECTED);

      if (onConnectedRef.current) {
        onConnectedRef.current();
      }
    }
  }, [relayMode, dataChannelOpen]);

  // ─── Initialize WebRTC connection ───

  useEffect(() => {
    if (!shouldConnect || !iceServers) {
      return;
    }

    // Don't create a WebRTC connection if we're in relay mode
    if (relayMode) {
      return;
    }

    // Prevent duplicate connections (React StrictMode)
    if (peerRef.current) {
      return;
    }

    destroyedRef.current = false;

    console.log('[THRIFT:RTC] Initializing WebRTC connection', { isHost });

    const peer = createPeerConnection({
      isHost,
      iceServers,
      sendSignal: (msg) => {
        if (sendWsMessageRef.current) {
          sendWsMessageRef.current(msg);
        }
      },
      onStateChange: (state) => {
        if (destroyedRef.current) return;
        setRtcState(state);

        // Handle terminal failure/disconnect states
        if (state === RTC_STATE.FAILED || state === RTC_STATE.DISCONNECTED) {
          if (onDisconnectedRef.current) {
            onDisconnectedRef.current(state);
          }
        }
      },
      onDataChannelOpen: () => {
        if (destroyedRef.current) return;
        console.log('[THRIFT:RTC] DataChannel verified — handshake complete');

        // Clear the failure timer — WebRTC succeeded
        if (failureTimerRef.current) {
          clearTimeout(failureTimerRef.current);
          failureTimerRef.current = null;
        }

        setDataChannelOpen(true);
        if (onConnectedRef.current) {
          onConnectedRef.current();
        }
      },
      onDataChannelClose: () => {
        if (destroyedRef.current) return;
        console.log('[THRIFT:RTC] DataChannel closed');
        setDataChannelOpen(false);
        if (onDisconnectedRef.current) {
          onDisconnectedRef.current(RTC_STATE.CLOSED);
        }
      },
      onDataChannelMessage: (data) => {
        if (destroyedRef.current) return;

        // Parse string messages for dev logging
        if (typeof data === 'string') {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'TEST') {
              console.log('[THRIFT:RTC] Test message received:', parsed.message);
            }
          } catch {
            // Not JSON — binary or raw string
          }
        }

        if (onMessageRef.current) {
          onMessageRef.current(data);
        }
      },
      onError: (err) => {
        console.error('[THRIFT:RTC] Error:', err);
        onErrorRef.current?.(err);
      },
    });

    peerRef.current = peer;

    // Set a failure timer — if WebRTC doesn't establish in 15s, request relay fallback
    failureTimerRef.current = setTimeout(() => {
      if (!destroyedRef.current && !dataChannelOpen && requestRelayRef.current) {
        console.log('[THRIFT:RTC] WebRTC failed to establish within timeout — requesting relay fallback');
        requestRelayRef.current();
      }
    }, WEBRTC_FAILURE_TIMEOUT_MS);

    // Cleanup on unmount or when shouldConnect becomes false
    return () => {
      destroyedRef.current = true;
      if (failureTimerRef.current) {
        clearTimeout(failureTimerRef.current);
        failureTimerRef.current = null;
      }
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      setRtcState(RTC_STATE.CLOSED);
      setDataChannelOpen(false);
    };
  }, [shouldConnect, isHost, iceServers, relayMode]);

  // ─── Handle incoming WebRTC signals from the WebSocket ───

  const handleSignal = useCallback((payload) => {
    if (peerRef.current) {
      peerRef.current.handleSignal(payload);
    } else {
      console.warn('[THRIFT:RTC] Received signal but no peer connection exists');
    }
  }, []);

  // ─── Send a test message through the DataChannel ───

  const sendTestMessage = useCallback((text) => {
    if (peerRef.current) {
      return peerRef.current.sendTestMessage(text);
    }
    console.warn('[THRIFT:RTC] Cannot send test message — no peer connection');
    return false;
  }, []);

  // ─── Send raw data through the DataChannel or relay ───

  const sendData = useCallback((data) => {
    // Relay mode: send through WebSocket
    if (isRelayFallback && sendRelayDataRef.current) {
      if (typeof data === 'string') {
        const encoder = new TextEncoder();
        sendRelayDataRef.current(encoder.encode(data));
      } else {
        sendRelayDataRef.current(data);
      }
      return true;
    }

    // Normal mode: send through DataChannel
    if (peerRef.current) {
      return peerRef.current.sendMessage(data);
    }
    return false;
  }, [isRelayFallback]);

  // ─── Send text through the DataChannel (never via WebSocket) ───

  const sendText = useCallback((text) => {
    if (typeof text !== 'string') return false;
    return sendData(createTextMessage(text));
  }, [sendData]);

  // ─── Send files (single or batch) sequentially through DataChannel / relay ───

  const sendFiles = useCallback(async (filesInput, { onBatchStart, onFileStart, onProgress, onFileComplete, onBatchComplete, onError } = {}) => {
    const rawFiles = Array.isArray(filesInput)
      ? filesInput
      : filesInput instanceof FileList
        ? Array.from(filesInput)
        : [filesInput];

    const files = rawFiles.filter((f) => f && typeof f.slice === 'function');
    if (files.length === 0) {
      console.warn('[THRIFT:RTC] Cannot send — no valid files provided');
      return false;
    }

    const peer = peerRef.current;
    const channel = peer?.dataChannel;
    const isRelay = isRelayFallback && Boolean(sendRelayDataRef.current);

    if (!isRelay && (!channel || channel.readyState !== 'open')) {
      console.warn('[THRIFT:RTC] Cannot send files — DataChannel not open');
      return false;
    }

    const encoder = new TextEncoder();
    const batchId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const totalFiles = files.length;
    const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);

    const fileMetaList = files.map((f, idx) => ({
      id: (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${idx}-${Math.random().toString(36).slice(2)}`,
      name: f.name || `file_${idx + 1}`,
      size: f.size || 0,
      type: f.type || 'application/octet-stream',
    }));

    try {
      // 1. Send BATCH_OFFER
      const { message: batchOfferMsg } = createBatchOfferMessage({
        batchId,
        totalFiles,
        totalBytes,
        files: fileMetaList,
      });

      if (isRelay) {
        sendRelayDataRef.current(encoder.encode(batchOfferMsg));
      } else {
        channel.send(batchOfferMsg);
      }

      onBatchStart?.({
        batchId,
        totalFiles,
        totalBytes,
        files: fileMetaList,
      });

      let overallTransferredBytes = 0;
      let lastSpeedCalcTime = performance.now();
      let lastSpeedBytes = 0;
      let currentSpeedMbps = '0.0';

      // 2. Stream files sequentially
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const meta = fileMetaList[i];

        // Send FILE_OFFER
        const { message: fileOfferMsg } = createFileOffer(meta, {
          batchId,
          fileIndex: i,
          totalFiles,
        });

        if (isRelay) {
          sendRelayDataRef.current(encoder.encode(fileOfferMsg));
        } else {
          channel.send(fileOfferMsg);
        }

        onFileStart?.({
          ...meta,
          fileIndex: i,
          totalFiles,
          batchId,
        });

        let fileTransferredBytes = 0;

        if (!isRelay && channel) {
          try {
            channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
          } catch {}
        }

        // Read in contiguous 2 MB blocks from disk into memory, then synchronously slice 64 KB sub-chunks from RAM
        for (let blockOffset = 0; blockOffset < file.size; blockOffset += DISK_BLOCK_BYTES) {
          const blockEnd = Math.min(file.size, blockOffset + DISK_BLOCK_BYTES);
          const blockBuffer = await file.slice(blockOffset, blockEnd).arrayBuffer();

          for (let chunkOffset = 0; chunkOffset < blockBuffer.byteLength; chunkOffset += FILE_CHUNK_BYTES) {
            // Flow control backpressure for DataChannel using native bufferedamountlow
            if (!isRelay) {
              if (channel.bufferedAmount > MAX_BUFFERED_BYTES) {
                await waitForBufferDrain(channel);
              }

              if (channel.readyState !== 'open') {
                throw new Error('P2P connection closed during file transfer');
              }
            }

            const chunkEnd = Math.min(blockBuffer.byteLength, chunkOffset + FILE_CHUNK_BYTES);
            const chunk = blockBuffer.slice(chunkOffset, chunkEnd);

            if (isRelay) {
              sendRelayDataRef.current(new Uint8Array(chunk));
              if (overallTransferredBytes % MAX_BUFFERED_BYTES === 0) {
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
            } else {
              channel.send(chunk);
            }

            fileTransferredBytes += chunk.byteLength;
            overallTransferredBytes += chunk.byteLength;

            // Calculate smoothed speed metric every 100ms
            const now = performance.now();
            const elapsed = now - lastSpeedCalcTime;
            if (elapsed >= 100) {
              const bytesSinceLast = overallTransferredBytes - lastSpeedBytes;
              const bytesPerSec = (bytesSinceLast / elapsed) * 1000;
              currentSpeedMbps = (bytesPerSec / (1024 * 1024)).toFixed(1);
              lastSpeedCalcTime = now;
              lastSpeedBytes = overallTransferredBytes;

              onProgress?.({
                fileId: meta.id,
                fileIndex: i,
                fileTransferredBytes,
                fileTotalBytes: file.size,
                overallTransferredBytes,
                totalBatchBytes: totalBytes,
                speedMbps: currentSpeedMbps,
                filePercentage: file.size > 0 ? Math.min(100, Math.round((fileTransferredBytes / file.size) * 100)) : 100,
                overallPercentage: totalBytes > 0 ? Math.min(100, Math.round((overallTransferredBytes / totalBytes) * 100)) : 100,
              });
            }
          }
        }

        // Final progress dispatch for 100% on this file
        onProgress?.({
          fileId: meta.id,
          fileIndex: i,
          fileTransferredBytes: file.size,
          fileTotalBytes: file.size,
          overallTransferredBytes,
          totalBatchBytes: totalBytes,
          speedMbps: currentSpeedMbps,
          filePercentage: 100,
          overallPercentage: totalBytes > 0 ? Math.min(100, Math.round((overallTransferredBytes / totalBytes) * 100)) : 100,
        });

        // Send FILE_COMPLETE
        const fileCompleteMsg = createFileCompleteMessage(meta.id, { batchId, fileIndex: i });
        if (isRelay) {
          sendRelayDataRef.current(encoder.encode(fileCompleteMsg));
        } else {
          channel.send(fileCompleteMsg);
        }

        onFileComplete?.({
          fileId: meta.id,
          fileIndex: i,
          ...meta,
        });
      }

      // 3. Send BATCH_COMPLETE
      const batchCompleteMsg = createBatchCompleteMessage(batchId, { totalFiles, totalBytes });
      if (isRelay) {
        sendRelayDataRef.current(encoder.encode(batchCompleteMsg));
      } else {
        channel.send(batchCompleteMsg);
      }

      onBatchComplete?.({
        batchId,
        totalFiles,
        totalBytes,
      });

      return true;
    } catch (error) {
      console.error('[THRIFT:RTC] File transfer failed:', error);
      onError?.(error);
      return false;
    }
  }, [isRelayFallback]);

  const sendFile = useCallback((file, options) => {
    return sendFiles([file], options);
  }, [sendFiles]);

  // ─── Clean up the connection ───

  const cleanup = useCallback(() => {
    destroyedRef.current = true;
    if (failureTimerRef.current) {
      clearTimeout(failureTimerRef.current);
      failureTimerRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setRtcState(RTC_STATE.CLOSED);
    setDataChannelOpen(false);
    setIsRelayFallback(false);
  }, []);

  return {
    rtcState,
    dataChannelOpen,
    isRelayFallback,
    handleSignal,
    sendTestMessage,
    sendData,
    sendText,
    sendFile,
    sendFiles,
    cleanup,
  };
}


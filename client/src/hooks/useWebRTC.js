// client/src/hooks/useWebRTC.js
// React hook that manages the WebRTC DataChannel lifecycle for THRIFT.
// Bridges the signaling WebSocket with the RTCPeerConnection engine.
// Handles React StrictMode by preventing duplicate connections.
// Supports automatic relay fallback when WebRTC DataChannel fails.

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPeerConnection } from '../lib/webrtc/createPeerConnection.js';
import { RTC_STATE } from '../lib/webrtc/constants.js';
import {
  createFileCompleteMessage,
  createFileOffer,
  createTextMessage,
} from '../lib/webrtc/messages.js';

const FILE_CHUNK_BYTES = 16 * 1024;
const MAX_BUFFERED_BYTES = 512 * 1024;
const WEBRTC_FAILURE_TIMEOUT_MS = 15_000; // 15s to establish WebRTC before fallback

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

  // ─── Send a file as ordered binary chunks through the DataChannel ───

  const sendFile = useCallback(async (file, { onStart, onProgress, onError } = {}) => {
    const peer = peerRef.current;
    const channel = peer?.dataChannel;

    // For relay mode, use WebSocket relay
    if (isRelayFallback && sendRelayDataRef.current) {
      if (!file || typeof file.slice !== 'function') {
        console.warn('[THRIFT:RTC] Cannot send file — invalid file');
        return false;
      }

      const { id, message } = createFileOffer(file);

      try {
        // Send file offer as text (encoded as binary for relay)
        const encoder = new TextEncoder();
        sendRelayDataRef.current(encoder.encode(message));
        onStart?.({ id, name: file.name, size: file.size, type: file.type || 'application/octet-stream' });

        let transferredBytes = 0;
        for (let offset = 0; offset < file.size; offset += FILE_CHUNK_BYTES) {
          const chunk = await file.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer();
          sendRelayDataRef.current(new Uint8Array(chunk));
          transferredBytes += chunk.byteLength;
          onProgress?.(transferredBytes, file.size);

          // Small delay to prevent overwhelming the WebSocket
          if (transferredBytes % (MAX_BUFFERED_BYTES) === 0) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }

        sendRelayDataRef.current(encoder.encode(createFileCompleteMessage(id)));
        return true;
      } catch (error) {
        console.error('[THRIFT:RTC] Relay file transfer failed:', error);
        onError?.(error);
        return false;
      }
    }

    // Normal WebRTC DataChannel file transfer
    if (!file || typeof file.slice !== 'function' || !channel || channel.readyState !== 'open') {
      console.warn('[THRIFT:RTC] Cannot send file — DataChannel not open');
      return false;
    }

    const { id, message } = createFileOffer(file);

    try {
      channel.send(message);
      onStart?.({ id, name: file.name, size: file.size, type: file.type || 'application/octet-stream' });

      let transferredBytes = 0;
      for (let offset = 0; offset < file.size; offset += FILE_CHUNK_BYTES) {
        while (channel.readyState === 'open' && channel.bufferedAmount > MAX_BUFFERED_BYTES) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        if (channel.readyState !== 'open') {
          throw new Error('P2P connection closed during transfer');
        }

        const chunk = await file.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer();
        channel.send(chunk);
        transferredBytes += chunk.byteLength;
        onProgress?.(transferredBytes, file.size);
      }

      channel.send(createFileCompleteMessage(id));
      return true;
    } catch (error) {
      console.error('[THRIFT:RTC] File transfer failed:', error);
      onError?.(error);
      return false;
    }
  }, [isRelayFallback]);

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
    cleanup,
  };
}

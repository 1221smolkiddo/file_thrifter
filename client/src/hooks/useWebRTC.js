// client/src/hooks/useWebRTC.js
// React hook that manages the WebRTC DataChannel lifecycle for THRIFT.
// Bridges the signaling WebSocket with the RTCPeerConnection engine.
// Handles React StrictMode by preventing duplicate connections.

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPeerConnection } from '../lib/webrtc/createPeerConnection.js';
import { RTC_STATE } from '../lib/webrtc/constants.js';
import { createTextMessage } from '../lib/webrtc/messages.js';

/**
 * useWebRTC — Manages a WebRTC DataChannel connection.
 *
 * @param {object} options
 * @param {boolean} options.isHost - Whether this peer is the session host
 * @param {object[]|null} options.iceServers - ICE server config from SESSION_CONNECTED
 * @param {function} options.sendWsMessage - Function to send messages via WebSocket
 * @param {boolean} options.shouldConnect - Whether to initiate the WebRTC connection
 * @param {function} [options.onConnected] - Called when DataChannel is verified open
 * @param {function} [options.onDisconnected] - Called when DataChannel/peer connection is lost
 * @param {function} [options.onMessage] - Called when a message is received through DataChannel
 *
 * @returns {object} WebRTC state and controls
 */
export function useWebRTC({
  isHost,
  iceServers,
  sendWsMessage,
  shouldConnect,
  onConnected,
  onDisconnected,
  onMessage,
}) {
  const [rtcState, setRtcState] = useState(RTC_STATE.NEW);
  const [dataChannelOpen, setDataChannelOpen] = useState(false);

  const peerRef = useRef(null);
  const destroyedRef = useRef(false);

  // Store latest callbacks in refs to avoid stale closures
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onMessageRef = useRef(onMessage);
  const sendWsMessageRef = useRef(sendWsMessage);

  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);
  useEffect(() => { onDisconnectedRef.current = onDisconnected; }, [onDisconnected]);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { sendWsMessageRef.current = sendWsMessage; }, [sendWsMessage]);

  // ─── Initialize WebRTC connection ───

  useEffect(() => {
    if (!shouldConnect || !iceServers) {
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
      },
    });

    peerRef.current = peer;

    // Cleanup on unmount or when shouldConnect becomes false
    return () => {
      destroyedRef.current = true;
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      setRtcState(RTC_STATE.CLOSED);
      setDataChannelOpen(false);
    };
  }, [shouldConnect, isHost, iceServers]);

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

  // ─── Send raw data through the DataChannel ───

  const sendData = useCallback((data) => {
    if (peerRef.current) {
      return peerRef.current.sendMessage(data);
    }
    return false;
  }, []);

  // ─── Send text through the DataChannel (never via WebSocket) ───

  const sendText = useCallback((text) => {
    if (typeof text !== 'string') return false;
    return sendData(createTextMessage(text));
  }, [sendData]);

  // ─── Clean up the connection ───

  const cleanup = useCallback(() => {
    destroyedRef.current = true;
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setRtcState(RTC_STATE.CLOSED);
    setDataChannelOpen(false);
  }, []);

  return {
    rtcState,
    dataChannelOpen,
    handleSignal,
    sendTestMessage,
    sendData,
    sendText,
    cleanup,
  };
}

// client/src/lib/webrtc/createPeerConnection.js
// Creates and manages an RTCPeerConnection with DataChannel for THRIFT.
// This is the core WebRTC engine — it handles SDP negotiation, ICE exchange,
// DataChannel lifecycle, and handshake verification.

import { DATA_CHANNEL_NAME, RTC_STATE, SIGNAL_TYPE, HANDSHAKE } from './constants.js';
import {
  createOfferSignal,
  createAnswerSignal,
  createIceCandidateSignal,
  parseSignalPayload,
} from './signaling.js';

/**
 * @typedef {object} PeerConnectionHandle
 * @property {RTCPeerConnection} pc - The underlying peer connection
 * @property {RTCDataChannel|null} dataChannel - The data channel (once open)
 * @property {function} handleSignal - Process an incoming WEBRTC_SIGNAL payload
 * @property {function} sendMessage - Send a string message through the DataChannel
 * @property {function} sendTestMessage - Send a test message through the DataChannel
 * @property {function} destroy - Tear down the connection and clean up
 */

/**
 * Create a WebRTC peer connection with DataChannel.
 *
 * @param {object} options
 * @param {boolean} options.isHost - Whether this peer is the session host (creates offer + DataChannel)
 * @param {object[]} options.iceServers - ICE server configuration from the backend
 * @param {function} options.sendSignal - Function to send a WEBRTC_SIGNAL message via WebSocket
 * @param {function} options.onStateChange - Callback: (rtcState: RTC_STATE) => void
 * @param {function} options.onDataChannelOpen - Callback: () => void
 * @param {function} options.onDataChannelClose - Callback: () => void
 * @param {function} options.onDataChannelMessage - Callback: (message: string|ArrayBuffer) => void
 * @param {function} [options.onError] - Callback: (error: Error) => void
 * @returns {PeerConnectionHandle}
 */
export function createPeerConnection({
  isHost,
  iceServers,
  sendSignal,
  onStateChange,
  onDataChannelOpen,
  onDataChannelClose,
  onDataChannelMessage,
  onError,
}) {
  let destroyed = false;
  let dataChannel = null;
  let handshakeCompleted = false;

  // ICE candidate queue — buffer candidates arriving before remote description is set
  const pendingCandidates = [];

  // ─── Create RTCPeerConnection ───

  const pcConfig = {
    iceServers: iceServers || [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  const pc = new RTCPeerConnection(pcConfig);

  console.log('[THRIFT:RTC] PeerConnection created', { isHost, iceServerCount: pcConfig.iceServers.length });

  // ─── Connection state tracking ───

  function mapConnectionState() {
    if (destroyed) return RTC_STATE.CLOSED;

    // Use connectionState if available (modern browsers), fall back to iceConnectionState
    const state = pc.connectionState || pc.iceConnectionState;

    switch (state) {
      case 'new':
        return RTC_STATE.NEW;
      case 'connecting':
      case 'checking':
        return RTC_STATE.CONNECTING;
      case 'connected':
      case 'completed':
        return RTC_STATE.CONNECTED;
      case 'disconnected':
        return RTC_STATE.DISCONNECTED;
      case 'failed':
        return RTC_STATE.FAILED;
      case 'closed':
        return RTC_STATE.CLOSED;
      default:
        return RTC_STATE.NEW;
    }
  }

  function emitStateChange() {
    if (destroyed) return;
    const state = mapConnectionState();
    console.log('[THRIFT:RTC] Connection state:', state);
    onStateChange(state);
  }

  pc.onconnectionstatechange = emitStateChange;
  pc.oniceconnectionstatechange = emitStateChange;

  // ─── ICE candidate handling ───

  pc.onicecandidate = (event) => {
    if (destroyed) return;
    if (event.candidate) {
      console.log('[THRIFT:RTC] Sending ICE candidate');
      sendSignal(createIceCandidateSignal(event.candidate));
    }
  };

  pc.onicecandidateerror = (event) => {
    // Non-fatal — some candidates may fail (e.g., STUN timeout on restrictive networks)
    console.warn('[THRIFT:RTC] ICE candidate error:', event.errorCode, event.errorText);
  };

  // ─── DataChannel setup ───

  function setupDataChannel(channel) {
    dataChannel = channel;
    dataChannel.binaryType = 'arraybuffer';

    dataChannel.onopen = () => {
      if (destroyed) return;
      console.log('[THRIFT:RTC] DataChannel OPEN');

      // Initiate handshake — host sends first
      if (isHost) {
        console.log('[THRIFT:RTC] Sending handshake');
        dataChannel.send(HANDSHAKE.REQUEST);
      }
    };

    dataChannel.onclose = () => {
      console.log('[THRIFT:RTC] DataChannel CLOSED');
      if (!destroyed) {
        onDataChannelClose();
      }
    };

    dataChannel.onerror = (event) => {
      console.error('[THRIFT:RTC] DataChannel error:', event);
      if (!destroyed && onError) {
        onError(new Error('DataChannel error'));
      }
    };

    dataChannel.onmessage = (event) => {
      if (destroyed) return;
      const data = event.data;

      // Handle handshake protocol
      if (typeof data === 'string') {
        if (data === HANDSHAKE.REQUEST) {
          console.log('[THRIFT:RTC] Received handshake, sending ACK');
          dataChannel.send(HANDSHAKE.ACK);
          handshakeCompleted = true;
          onDataChannelOpen();
          return;
        }

        if (data === HANDSHAKE.ACK) {
          console.log('[THRIFT:RTC] Handshake ACK received — DataChannel verified');
          handshakeCompleted = true;
          onDataChannelOpen();
          return;
        }
      }

      // Forward all other messages to the application
      onDataChannelMessage(data);
    };
  }

  // Host creates the DataChannel; guest receives it via ondatachannel
  if (isHost) {
    const channel = pc.createDataChannel(DATA_CHANNEL_NAME, {
      ordered: true,
    });
    setupDataChannel(channel);
  } else {
    pc.ondatachannel = (event) => {
      console.log('[THRIFT:RTC] Received DataChannel from host');
      setupDataChannel(event.channel);
    };
  }

  // ─── SDP Negotiation ───

  async function createOffer() {
    if (destroyed) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[THRIFT:RTC] Created and set local offer');
      sendSignal(createOfferSignal(pc.localDescription));
    } catch (err) {
      console.error('[THRIFT:RTC] Error creating offer:', err);
      if (onError) onError(err);
    }
  }

  async function handleOffer(sdp) {
    if (destroyed) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
      console.log('[THRIFT:RTC] Set remote offer, creating answer');

      // Flush queued ICE candidates now that remote description is set
      await flushPendingCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[THRIFT:RTC] Created and set local answer');
      sendSignal(createAnswerSignal(pc.localDescription));
    } catch (err) {
      console.error('[THRIFT:RTC] Error handling offer:', err);
      if (onError) onError(err);
    }
  }

  async function handleAnswer(sdp) {
    if (destroyed) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
      console.log('[THRIFT:RTC] Set remote answer');

      // Flush queued ICE candidates
      await flushPendingCandidates();
    } catch (err) {
      console.error('[THRIFT:RTC] Error handling answer:', err);
      if (onError) onError(err);
    }
  }

  async function handleIceCandidate(candidateData) {
    if (destroyed) return;
    try {
      const candidate = new RTCIceCandidate(candidateData);

      // Queue if remote description is not yet set
      if (!pc.remoteDescription) {
        console.log('[THRIFT:RTC] Queuing ICE candidate (no remote description yet)');
        pendingCandidates.push(candidate);
        return;
      }

      await pc.addIceCandidate(candidate);
    } catch (err) {
      // Non-fatal — some candidates may be invalid
      console.warn('[THRIFT:RTC] Error adding ICE candidate:', err.message);
    }
  }

  async function flushPendingCandidates() {
    if (pendingCandidates.length === 0) return;
    console.log(`[THRIFT:RTC] Flushing ${pendingCandidates.length} queued ICE candidates`);

    const candidates = [...pendingCandidates];
    pendingCandidates.length = 0;

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('[THRIFT:RTC] Error flushing ICE candidate:', err.message);
      }
    }
  }

  // ─── Incoming signal handler ───

  function handleSignal(payload) {
    if (destroyed) return;

    const parsed = parseSignalPayload(payload);
    if (!parsed) return;

    switch (parsed.type) {
      case SIGNAL_TYPE.OFFER:
        handleOffer(parsed.sdp);
        break;
      case SIGNAL_TYPE.ANSWER:
        handleAnswer(parsed.sdp);
        break;
      case SIGNAL_TYPE.ICE_CANDIDATE:
        handleIceCandidate(parsed.candidate);
        break;
    }
  }

  // ─── Public API ───

  function sendMessage(message) {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.warn('[THRIFT:RTC] Cannot send — DataChannel not open');
      return false;
    }
    dataChannel.send(message);
    return true;
  }

  function sendTestMessage(text) {
    const msg = JSON.stringify({ type: 'TEST', message: text });
    console.log('[THRIFT:RTC] Sending test message:', text);
    return sendMessage(msg);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;

    console.log('[THRIFT:RTC] Destroying peer connection');

    // Close DataChannel
    if (dataChannel) {
      try {
        dataChannel.onopen = null;
        dataChannel.onclose = null;
        dataChannel.onerror = null;
        dataChannel.onmessage = null;
        dataChannel.close();
      } catch {}
      dataChannel = null;
    }

    // Close PeerConnection
    try {
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onicecandidate = null;
      pc.onicecandidateerror = null;
      pc.ondatachannel = null;
      pc.close();
    } catch {}

    // Clear queues
    pendingCandidates.length = 0;

    handshakeCompleted = false;
  }

  // ─── Start negotiation if host ───

  if (isHost) {
    // Slight delay to ensure the DataChannel is attached before creating the offer
    // (needed for the DataChannel to be included in the SDP)
    Promise.resolve().then(() => createOffer());
  }

  return {
    pc,
    get dataChannel() { return dataChannel; },
    get handshakeCompleted() { return handshakeCompleted; },
    handleSignal,
    sendMessage,
    sendTestMessage,
    destroy,
  };
}

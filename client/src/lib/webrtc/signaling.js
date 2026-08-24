// client/src/lib/webrtc/signaling.js
// Signaling adapter — bridges the WebSocket session hook with WebRTC negotiation.
// Formats and parses WEBRTC_SIGNAL messages without knowing about RTCPeerConnection.

import { SIGNAL_TYPE } from './constants.js';

/**
 * Create a signaling message envelope for the WebSocket layer.
 * @param {string} type - One of SIGNAL_TYPE values
 * @param {object} data - The signaling payload (SDP or ICE candidate)
 * @returns {{ type: string, payload: object }}
 */
export function createSignalMessage(type, data) {
  return {
    type: 'WEBRTC_SIGNAL',
    payload: {
      type,
      ...data,
    },
  };
}

/**
 * Create an SDP offer signal message.
 * @param {RTCSessionDescription} offer
 */
export function createOfferSignal(offer) {
  return createSignalMessage(SIGNAL_TYPE.OFFER, {
    sdp: offer.sdp,
  });
}

/**
 * Create an SDP answer signal message.
 * @param {RTCSessionDescription} answer
 */
export function createAnswerSignal(answer) {
  return createSignalMessage(SIGNAL_TYPE.ANSWER, {
    sdp: answer.sdp,
  });
}

/**
 * Create an ICE candidate signal message.
 * @param {RTCIceCandidate} candidate
 */
export function createIceCandidateSignal(candidate) {
  return createSignalMessage(SIGNAL_TYPE.ICE_CANDIDATE, {
    candidate: candidate.toJSON(),
  });
}

/**
 * Parse an incoming WEBRTC_SIGNAL payload.
 * @param {object} payload - The payload from a WEBRTC_SIGNAL message
 * @returns {{ type: string, sdp?: string, candidate?: object } | null}
 */
export function parseSignalPayload(payload) {
  if (!payload || typeof payload !== 'object' || !payload.type) {
    console.warn('[THRIFT:RTC] Invalid signal payload received');
    return null;
  }

  switch (payload.type) {
    case SIGNAL_TYPE.OFFER:
    case SIGNAL_TYPE.ANSWER:
      if (typeof payload.sdp !== 'string') {
        console.warn('[THRIFT:RTC] Signal missing SDP');
        return null;
      }
      return { type: payload.type, sdp: payload.sdp };

    case SIGNAL_TYPE.ICE_CANDIDATE:
      if (!payload.candidate) {
        console.warn('[THRIFT:RTC] Signal missing ICE candidate');
        return null;
      }
      return { type: payload.type, candidate: payload.candidate };

    default:
      console.warn('[THRIFT:RTC] Unknown signal type:', payload.type);
      return null;
  }
}

// client/src/lib/webrtc/constants.js
// WebRTC constants for the THRIFT DataChannel layer.

/**
 * DataChannel name used between peers.
 */
export const DATA_CHANNEL_NAME = 'thrift-data';

/**
 * WebRTC connection states exposed to the application.
 */
export const RTC_STATE = {
  NEW: 'NEW',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  FAILED: 'FAILED',
  CLOSED: 'CLOSED',
};

/**
 * Signaling payload types sent through WEBRTC_SIGNAL.
 */
export const SIGNAL_TYPE = {
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice-candidate',
};

/**
 * Handshake messages sent through the DataChannel on open.
 */
export const HANDSHAKE = {
  REQUEST: 'THRIFT_HANDSHAKE',
  ACK: 'THRIFT_HANDSHAKE_ACK',
};

/**
 * Application messages carried exclusively by the WebRTC DataChannel.
 * File message types are reserved for the forthcoming transfer engine.
 */
export const DATA_MESSAGE_TYPE = {
  ROLE: 'ROLE',
  TEXT: 'TEXT',
  TEST: 'TEST',
  BATCH_OFFER: 'BATCH_OFFER',
  FILE_OFFER: 'FILE_OFFER',
  FILE_CHUNK: 'FILE_CHUNK',
  FILE_COMPLETE: 'FILE_COMPLETE',
  TRANSFER_ACK: 'TRANSFER_ACK',
  BATCH_COMPLETE: 'BATCH_COMPLETE',
};


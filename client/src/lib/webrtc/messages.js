import { DATA_MESSAGE_TYPE } from './constants.js';

function createMessageId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Create the envelope for a plain-text DataChannel message.
 * Text stays UTF-8 JSON and is never Base64 encoded or sent to signaling.
 */
export function createTextMessage(payload) {
  return JSON.stringify({
    type: DATA_MESSAGE_TYPE.TEXT,
    id: createMessageId(),
    payload,
  });
}

/**
 * Parse supported DataChannel application messages without accepting data from
 * any other transport.
 */
export function parseDataMessage(data) {
  if (typeof data !== 'string') return null;

  try {
    const message = JSON.parse(data);
    if (!message || typeof message !== 'object') return null;

    if (message.type === DATA_MESSAGE_TYPE.TEXT
      && typeof message.id === 'string'
      && typeof message.payload === 'string') {
      return message;
    }

    if (message.type === DATA_MESSAGE_TYPE.TEST) {
      return message;
    }
  } catch {
    // Binary data and malformed application payloads are handled by future
    // file-transfer protocol work.
  }

  return null;
}

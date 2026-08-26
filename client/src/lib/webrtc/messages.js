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
  return createMessage(DATA_MESSAGE_TYPE.TEXT, payload);
}

function createMessage(type, payload, id = createMessageId()) {
  return JSON.stringify({ type, id, payload });
}

export function createRoleMessage(role) {
  return createMessage(DATA_MESSAGE_TYPE.ROLE, { role });
}

export function createBatchOfferMessage({ batchId = createMessageId(), totalFiles, totalBytes, files }) {
  return {
    batchId,
    message: createMessage(DATA_MESSAGE_TYPE.BATCH_OFFER, {
      batchId,
      totalFiles,
      totalBytes,
      files,
    }, batchId),
  };
}

export function createFileOffer(fileInfo, { batchId, fileIndex, totalFiles } = {}) {
  const id = fileInfo.id || createMessageId();
  return {
    id,
    message: createMessage(DATA_MESSAGE_TYPE.FILE_OFFER, {
      name: fileInfo.name,
      size: fileInfo.size,
      type: fileInfo.type || 'application/octet-stream',
      batchId: batchId || null,
      fileIndex: Number.isInteger(fileIndex) ? fileIndex : 0,
      totalFiles: Number.isInteger(totalFiles) ? totalFiles : 1,
    }, id),
  };
}

export function createFileCompleteMessage(id, { batchId, fileIndex } = {}) {
  return createMessage(DATA_MESSAGE_TYPE.FILE_COMPLETE, {
    batchId: batchId || null,
    fileIndex: Number.isInteger(fileIndex) ? fileIndex : 0,
  }, id);
}

export function createTransferAckMessage(id, { batchId, fileIndex } = {}) {
  return createMessage(DATA_MESSAGE_TYPE.TRANSFER_ACK, {
    batchId: batchId || null,
    fileIndex: Number.isInteger(fileIndex) ? fileIndex : 0,
  }, id);
}

export function createBatchCompleteMessage(batchId, { totalFiles, totalBytes } = {}) {
  return createMessage(DATA_MESSAGE_TYPE.BATCH_COMPLETE, {
    batchId,
    totalFiles,
    totalBytes,
  }, batchId);
}

export function createTransferCancelMessage(reason = 'USER_CANCELLED') {
  return createMessage(DATA_MESSAGE_TYPE.TRANSFER_CANCEL, { reason });
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

    if (message.type === DATA_MESSAGE_TYPE.TEST) return message;
    if (typeof message.id !== 'string') return null;

    switch (message.type) {
      case DATA_MESSAGE_TYPE.TEXT:
        return typeof message.payload === 'string' ? message : null;
      case DATA_MESSAGE_TYPE.ROLE:
        return ['SENDER', 'RECEIVER'].includes(message.payload?.role) ? message : null;
      case DATA_MESSAGE_TYPE.BATCH_OFFER:
        return typeof message.payload?.batchId === 'string'
          && Number.isFinite(message.payload?.totalFiles)
          && Number.isFinite(message.payload?.totalBytes)
          && Array.isArray(message.payload?.files) ? message : null;
      case DATA_MESSAGE_TYPE.FILE_OFFER:
        return typeof message.payload?.name === 'string'
          && Number.isFinite(message.payload?.size)
          && message.payload.size >= 0
          && typeof message.payload?.type === 'string' ? message : null;
      case DATA_MESSAGE_TYPE.FILE_COMPLETE:
      case DATA_MESSAGE_TYPE.TRANSFER_ACK:
      case DATA_MESSAGE_TYPE.BATCH_COMPLETE:
      case DATA_MESSAGE_TYPE.TRANSFER_CANCEL:
        return message;
      default:
        return null;
    }
  } catch {
    // Binary data and malformed application payloads
  }

  return null;
}


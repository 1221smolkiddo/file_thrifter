// server/utils/logger.js
// Privacy-conscious logger for THRIFT signaling server.
// NEVER logs: secrets, tokens, file contents, file names, IP addresses, WebRTC payloads.

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

function timestamp() {
  return new Date().toISOString();
}

function formatMessage(level, category, message, meta = {}) {
  const parts = [`[${timestamp()}]`, `[${level}]`, `[${category}]`, message];
  if (Object.keys(meta).length > 0) {
    parts.push(JSON.stringify(meta));
  }
  return parts.join(' ');
}

const logger = {
  debug(category, message, meta) {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.log(formatMessage('DEBUG', category, message, meta));
    }
  },

  info(category, message, meta) {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(formatMessage('INFO', category, message, meta));
    }
  },

  warn(category, message, meta) {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.warn(formatMessage('WARN', category, message, meta));
    }
  },

  error(category, message, meta) {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      console.error(formatMessage('ERROR', category, message, meta));
    }
  },

  // Convenience: log a session event without exposing secrets
  session(event, sessionDisplayId) {
    logger.info('SESSION', event, { displayId: sessionDisplayId || 'N/A' });
  },

  // Convenience: log a WebSocket event
  ws(event, meta) {
    logger.info('WS', event, meta);
  },
};

export default logger;

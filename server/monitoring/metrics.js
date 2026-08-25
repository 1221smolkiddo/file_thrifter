// server/monitoring/metrics.js
// Lightweight in-memory metrics for THRIFT signaling server.
// Exposes counters and gauges — no external dependencies.

class Metrics {
  constructor() {
    this._counters = {
      sessions_created: 0,
      sessions_joined: 0,
      sessions_expired: 0,
      sessions_timed_out: 0,
      webrtc_signals_routed: 0,
      relay_requests: 0,
      relay_bytes_total: 0,
      reconnect_attempts: 0,
      reconnect_successes: 0,
      rate_limit_hits: 0,
      discovery_requests: 0,
      ws_connections_total: 0,
      ws_messages_total: 0,
    };

    this._startedAt = Date.now();
  }

  /**
   * Increment a counter by 1.
   * @param {string} name - Counter name
   */
  increment(name) {
    if (name in this._counters) {
      this._counters[name]++;
    }
  }

  /**
   * Add a value to a counter (e.g. relay bytes).
   * @param {string} name - Counter name
   * @param {number} value - Value to add
   */
  add(name, value) {
    if (name in this._counters && typeof value === 'number') {
      this._counters[name] += value;
    }
  }

  /**
   * Get a snapshot of all metrics.
   * @param {number} activeSessionCount - Current active sessions (gauge)
   * @returns {object}
   */
  getSnapshot(activeSessionCount = 0) {
    return {
      uptime_seconds: Math.floor((Date.now() - this._startedAt) / 1000),
      active_sessions: activeSessionCount,
      counters: { ...this._counters },
    };
  }

  /**
   * Reset all counters (for testing).
   */
  reset() {
    for (const key of Object.keys(this._counters)) {
      this._counters[key] = 0;
    }
  }
}

const metrics = new Metrics();
export default metrics;
export { Metrics };

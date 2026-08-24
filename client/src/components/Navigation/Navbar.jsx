import React from 'react';
import { X, GlobeLock } from 'lucide-react';
import { APP_STATE } from '../../hooks/useWebSocketSession';

export function Navbar({ appState, sessionData, onDisconnect }) {
  const getStatusBadge = () => {
    switch (appState) {
      case APP_STATE.WAITING_FOR_DEVICE:
        return { text: 'WAITING', color: 'var(--accent-lime)' };
      case APP_STATE.PAIRING:
        return { text: 'PAIRING', color: 'var(--accent-lime)' };
      case APP_STATE.WEBRTC_CONNECTING:
        return { text: 'SECURING P2P', color: 'var(--accent-lime)' };
      case APP_STATE.ROLE_SELECTION:
        return { text: 'CHOOSE MODE', color: 'var(--accent-lime)' };
      case APP_STATE.CONNECTED:
        return { text: 'CONNECTED', color: 'var(--accent-lime)' };
      case APP_STATE.TRANSFERRING:
        return { text: 'TRANSFERRING', color: 'var(--accent-lime)' };
      case APP_STATE.COMPLETED:
        return { text: 'COMPLETED', color: 'var(--accent-lime)' };
      case APP_STATE.EXPIRED:
      case APP_STATE.ERROR:
        return { text: 'DISCONNECTED', color: 'var(--text-muted)' };
      default:
        return { text: 'PRIVATE • P2P', color: 'var(--text-secondary)' };
    }
  };

  const status = getStatusBadge();

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1.25rem 2rem',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
        <h1 style={{
          fontSize: '1.1rem',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color: 'var(--text-primary)',
        }}>
          THRIFT
        </h1>
        <p style={{
          fontSize: '0.65rem',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          fontWeight: 600,
          textTransform: 'uppercase'
        }}>
          Share without a trace
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.65rem',
          fontWeight: 600,
          letterSpacing: '0.1em',
          color: status.color,
        }} className="mono">
          {appState === APP_STATE.IDLE ? (
            <GlobeLock size={12} />
          ) : (
            <span style={{
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              backgroundColor: status.color,
              display: 'inline-block',
            }} className={appState !== APP_STATE.ERROR && appState !== APP_STATE.EXPIRED ? "animate-pulse-glow" : ""} />
          )}
          <span>{status.text}</span>
        </div>

        {appState !== APP_STATE.IDLE && (
          <button
            onClick={onDisconnect}
            style={{
              background: 'transparent',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              padding: '0.25rem',
            }}
            title="Leave / Disconnect"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </header>
  );
}

import React from 'react';
import { Shield, Zap, X } from 'lucide-react';
import { APP_STATE } from '../../hooks/useWebSocketSession';

export function Navbar({ appState, sessionData, onDisconnect }) {
  const getStatusBadge = () => {
    switch (appState) {
      case APP_STATE.WAITING_FOR_DEVICE:
        return { text: 'WAITING FOR DEVICE', color: 'var(--accent-cyan)' };
      case APP_STATE.PAIRING:
        return { text: 'PAIRING...', color: 'var(--accent-cyan)' };
      case APP_STATE.CONNECTED:
        return { text: 'DEVICE CONNECTED', color: 'var(--accent-green)' };
      case APP_STATE.TRANSFERRING:
        return { text: 'BLASTING DATA', color: 'var(--accent-cyan)' };
      case APP_STATE.COMPLETED:
        return { text: 'TRANSFER COMPLETE', color: 'var(--accent-green)' };
      case APP_STATE.EXPIRED:
        return { text: 'SESSION EXPIRED', color: 'var(--accent-red)' };
      case APP_STATE.ERROR:
        return { text: 'ERROR', color: 'var(--accent-red)' };
      default:
        return null;
    }
  };

  const status = getStatusBadge();

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1rem 1.5rem',
      borderBottom: '1px solid var(--bg-surface-border)',
      background: 'rgba(8, 8, 10, 0.85)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          width: '32px',
          height: '32px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--bg-surface-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-cyan)',
        }}>
          <Zap size={18} />
        </div>
        <div>
          <h1 style={{
            fontSize: '1.25rem',
            fontWeight: 800,
            letterSpacing: '0.05em',
            lineHeight: 1,
            color: 'var(--text-primary)',
          }}>
            THRIFT
          </h1>
          <p style={{
            fontSize: '0.65rem',
            letterSpacing: '0.15em',
            color: 'var(--text-secondary)',
            fontWeight: 600,
            marginTop: '2px',
          }}>
            SHARE WITHOUT A TRACE
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {status && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--bg-surface)',
            border: `1px solid ${status.color}`,
            padding: '0.35rem 0.75rem',
            borderRadius: '2px',
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
          }} className="mono">
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: status.color,
              display: 'inline-block',
            }} className="animate-pulse-glow" />
            <span style={{ color: status.color }}>{status.text}</span>
            {sessionData.displayId && (
              <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>
                [{sessionData.displayId}]
              </span>
            )}
          </div>
        )}

        {appState !== APP_STATE.IDLE && (
          <button
            onClick={onDisconnect}
            style={{
              background: 'transparent',
              border: '1px solid var(--bg-surface-border)',
              color: 'var(--text-secondary)',
              padding: '0.4rem 0.6rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
            title="Leave / Disconnect"
          >
            <X size={14} />
            <span style={{ display: 'none', minWidth: '400px' }}>Exit</span>
          </button>
        )}
      </div>
    </header>
  );
}

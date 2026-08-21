import React, { useState } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { QRCodeDisplay } from '../components/QR/QRCodeDisplay';
import { APP_STATE } from '../hooks/useWebSocketSession';

export function Home({ appState, sessionData, onCreateSession, onJoinSession }) {
  const [inputToken, setInputToken] = useState('');

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    if (!inputToken.trim()) return;

    let token = inputToken.trim();
    if (token.includes('token=')) {
      const match = token.match(/token=([a-zA-Z0-9]+)/);
      if (match && match[1]) token = match[1];
    }
    onJoinSession(token);
  };

  const isWaiting = appState === APP_STATE.WAITING_FOR_DEVICE || appState === APP_STATE.CREATING_SESSION;

  return (
    <div style={{
      width: '100%',
      maxWidth: '1100px',
      margin: '0 auto',
      padding: '2rem',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: '4rem',
      alignItems: 'center',
    }}>
      {/* Left Side: Typography & Description */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '2rem',
      }}>
        <h1 style={{
          fontSize: 'clamp(2.5rem, 5vw, 4rem)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          color: 'var(--text-primary)',
        }}>
          SHARE FILES<br />
          WITHOUT A<br />
          MESS.
        </h1>

        <p style={{
          fontSize: '1rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          maxWidth: '380px',
        }}>
          Share files directly.<br />
          between your devices.<br /><br />
          No accounts. No storage. No history.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '340px' }}>
          {!isWaiting && (
            <button
              onClick={onCreateSession}
              style={{
                width: '100%',
                background: 'var(--text-primary)',
                color: 'var(--bg-primary)',
                padding: '1rem 1.25rem',
                fontWeight: 700,
                fontSize: '0.9rem',
                letterSpacing: '0.05em',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
              className="touch-target"
            >
              GENERATE QR <ArrowRight size={18} />
            </button>
          )}

          {!isWaiting && (
            <form onSubmit={handleJoinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                color: 'var(--text-muted)',
                fontSize: '0.7rem',
                marginBottom: '0.25rem',
              }} className="mono">
                <span>OR JOIN EXISTING</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                <input
                  type="text"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  placeholder="Paste pairing token..."
                  style={{
                    flex: 1,
                    padding: '0.75rem 1rem',
                    fontSize: '0.85rem',
                    borderRadius: '2px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--bg-surface-border)',
                  }}
                  className="mono"
                />
                <button
                  type="submit"
                  disabled={!inputToken.trim()}
                  style={{
                    background: inputToken.trim() ? 'var(--bg-surface-hover)' : 'transparent',
                    border: `1px solid ${inputToken.trim() ? 'var(--text-secondary)' : 'var(--bg-surface-border)'}`,
                    color: inputToken.trim() ? 'var(--text-primary)' : 'var(--text-muted)',
                    padding: '0 1rem',
                    fontWeight: 600,
                    borderRadius: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Right Side: QR Panel */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
      }}>
        {isWaiting ? (
          <div style={{ width: '100%', maxWidth: '380px' }}>
            {appState === APP_STATE.CREATING_SESSION ? (
              <div style={{
                width: '100%',
                aspectRatio: '1/1',
                background: 'var(--bg-surface)',
                border: '1px solid var(--bg-surface-border)',
                borderRadius: '4px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '2rem'
              }} className="swiss-grid-bg mono">
                <p style={{ color: 'var(--accent-lime)' }} className="animate-pulse-glow">
                  GENERATING CRYPTOGRAPHIC SESSION...
                </p>
              </div>
            ) : (
              <QRCodeDisplay sessionData={sessionData} />
            )}
          </div>
        ) : (
          <div
            onClick={onCreateSession}
            style={{
              width: '100%',
              maxWidth: '380px',
              aspectRatio: '1/1',
              background: 'var(--bg-surface)',
              border: '1px solid var(--bg-surface-border)',
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              position: 'relative',
            }}
            className="swiss-grid-bg"
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-lime)';
              e.currentTarget.style.boxShadow = '0 0 24px var(--accent-lime-glow)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--bg-surface-border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <span className="mono" style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              color: 'var(--text-secondary)',
            }}>
              GENERATE QR <ArrowUpRight size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

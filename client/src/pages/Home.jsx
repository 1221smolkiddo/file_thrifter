import React, { useState } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { QRCodeDisplay } from '../components/QR/QRCodeDisplay';
import { APP_STATE } from '../hooks/useWebSocketSession';
import { BorderGlow } from '../components/Common/BorderGlow';

export function Home({ appState, sessionData, localSessions = [], onCreateSession, onJoinSession }) {
  const [inputToken, setInputToken] = useState('');
  const [joinError, setJoinError] = useState('');

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    if (!inputToken.trim()) return;

    const input = inputToken.trim();
    const pairingCode = input.match(/^([A-Z0-9]{6}):([a-f0-9]{64})$/i);
    if (pairingCode) {
      onJoinSession(pairingCode[1].toUpperCase(), pairingCode[2]);
      return;
    }

    // Try to parse as a full URL with ?session=...&token=...
    try {
      const url = new URL(input.startsWith('http') ? input : `http://placeholder${input.startsWith('/') ? '' : '/'}${input}`);
      const sessionId = url.searchParams.get('session');
      const token = url.searchParams.get('token');
      if (sessionId && token) {
        onJoinSession(sessionId, token);
        return;
      }
    } catch {
      // Not a valid URL, treat as raw token
    }

    // If it doesn't look like a URL, show error — we need both session + token
    setJoinError('Paste the pairing code shown below the QR, or scan it.');
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
            <BorderGlow
              as="button"
              onClick={onCreateSession}
              glowColor="var(--accent-lime)"
              backgroundColor="var(--text-primary)"
              alwaysActive={true}
              pointerTracked={false}
              speed={3}
              style={{ width: '100%' }}
            >
              <div
                style={{
                  padding: '1rem 1.25rem',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  color: 'var(--bg-primary)',
                  letterSpacing: '0.05em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  width: '100%',
                }}
              >
                GENERATE QR <ArrowRight size={18} className="icon-arrow" />
              </div>
            </BorderGlow>
          )}

          {!isWaiting && (
            <form onSubmit={handleJoinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {localSessions && localSessions.length > 0 && (
                <div style={{
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(218, 255, 1, 0.05)',
                  border: '1px solid rgba(218, 255, 1, 0.3)',
                  borderRadius: '3px',
                  fontSize: '0.75rem',
                  color: 'var(--accent-lime)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.25rem',
                }} className="mono animate-fade-in">
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-lime)', boxShadow: '0 0 6px var(--accent-lime)' }} />
                  <span>{localSessions.length} session{localSessions.length > 1 ? 's' : ''} detected on your network</span>
                </div>
              )}
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
                  onChange={(e) => {
                    setInputToken(e.target.value);
                    setJoinError('');
                  }}
                  placeholder="Paste pairing code..."
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
                  className="border-glow-btn"
                  style={{
                    padding: '0 1.2rem',
                    opacity: inputToken.trim() ? 1 : 0.5,
                    cursor: inputToken.trim() ? 'pointer' : 'default',
                    color: 'var(--text-primary)',
                  }}
                >
                  <ArrowRight size={16} className="icon-arrow" />
                </button>
              </div>
              {joinError && <span role="alert" className="mono" style={{ color: 'var(--accent-red)', fontSize: '0.7rem' }}>{joinError}</span>}
            </form>
          )}
        </div>
      </div>

      {/* Right Side: QR Panel with ReactBits BorderGlow */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
      }}>
        {isWaiting ? (
          <div style={{ width: '100%', maxWidth: '380px' }}>
            {appState === APP_STATE.CREATING_SESSION ? (
              <BorderGlow
                alwaysActive={true}
                speed={2.5}
                glowColor="var(--accent-lime)"
                style={{ width: '100%', maxWidth: '380px', aspectRatio: '1/1' }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '2rem',
                  }}
                  className="swiss-grid-bg mono"
                >
                  <p style={{ color: 'var(--accent-lime)' }} className="animate-pulse-glow">
                    GENERATING CRYPTOGRAPHIC SESSION...
                  </p>
                </div>
              </BorderGlow>
            ) : (
              <QRCodeDisplay sessionData={sessionData} />
            )}
          </div>
        ) : (
          <BorderGlow
            as="div"
            onClick={onCreateSession}
            pointerTracked={false}
            alwaysActive={true}
            speed={3.5}
            glowColor="var(--accent-lime)"
            secondaryColor="#ffffff"
            backgroundColor="var(--bg-surface)"
            borderRadius="4px"
            glowIntensity={24}
            className="qr-placeholder-card"
            style={{
              width: '100%',
              maxWidth: '380px',
              aspectRatio: '1/1',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="swiss-grid-bg"
            >
              <span className="mono" style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                color: 'var(--text-secondary)',
                transition: 'color 0.2s ease',
              }}>
                GENERATE QR <ArrowUpRight size={14} className="icon-arrow-up-right" style={{ display: 'inline', verticalAlign: 'text-bottom' }} />
              </span>
            </div>
          </BorderGlow>
        )}
      </div>
    </div>
  );
}

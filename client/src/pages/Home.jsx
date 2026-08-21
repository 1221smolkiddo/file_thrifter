import React, { useState } from 'react';
import { Zap, QrCode, ArrowRight, ShieldCheck, Lock, Smartphone } from 'lucide-react';

export function Home({ onCreateSession, onJoinSession }) {
  const [inputToken, setInputToken] = useState('');

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    if (!inputToken.trim()) return;

    // Handle full URL pasted or token alone
    let token = inputToken.trim();
    if (token.includes('token=')) {
      const match = token.match(/token=([a-zA-Z0-9]+)/);
      if (match && match[1]) token = match[1];
    }
    onJoinSession(token);
  };

  return (
    <div style={{
      maxWidth: '680px',
      width: '100%',
      margin: '0 auto',
      padding: '2rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '2.5rem',
      textAlign: 'center',
    }}>
      {/* Brand Hero */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'var(--accent-cyan-glow)',
          border: '1px solid var(--accent-cyan)',
          padding: '0.35rem 0.85rem',
          borderRadius: '12px',
          color: 'var(--accent-cyan)',
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.1em',
        }} className="mono">
          <ShieldCheck size={14} />
          ZERO STORAGE // P2P SIGNALING
        </div>

        <h1 style={{
          fontSize: '3.5rem',
          fontWeight: 900,
          letterSpacing: '-0.03em',
          lineHeight: 1,
          marginTop: '0.5rem',
          color: 'var(--text-primary)',
        }}>
          THRIFT
        </h1>

        <p style={{
          fontSize: '1rem',
          fontWeight: 600,
          letterSpacing: '0.25em',
          color: 'var(--accent-cyan)',
          marginTop: '0.25rem',
        }}>
          SHARE WITHOUT A TRACE
        </p>

        <p style={{
          fontSize: '0.9rem',
          color: 'var(--text-secondary)',
          maxWidth: '480px',
          lineHeight: 1.6,
          marginTop: '0.75rem',
        }}>
          Instant, ephemeral file & text transfer between phone and laptop. No accounts, no permanent storage, no history.
        </p>
      </div>

      {/* Main Actions */}
      <div style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}>
        <button
          onClick={onCreateSession}
          style={{
            width: '100%',
            background: 'var(--accent-cyan)',
            color: '#08080a',
            padding: '1.25rem',
            fontWeight: 800,
            fontSize: '1.1rem',
            letterSpacing: '0.08em',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            boxShadow: '0 0 30px var(--accent-cyan-glow)',
          }}
          className="touch-target"
        >
          <QrCode size={24} />
          CREATE SESSION (SHOW QR)
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          color: 'var(--text-muted)',
          fontSize: '0.75rem',
        }} className="mono">
          <div style={{ flex: 1, height: '1px', background: 'var(--bg-surface-border)' }} />
          <span>OR JOIN VIA TOKEN</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--bg-surface-border)' }} />
        </div>

        <form onSubmit={handleJoinSubmit} style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
          <input
            type="text"
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
            placeholder="Paste pairing token or QR link..."
            style={{
              flex: 1,
              padding: '0.85rem 1rem',
              fontSize: '0.9rem',
              borderRadius: '4px',
            }}
            className="mono"
          />
          <button
            type="submit"
            disabled={!inputToken.trim()}
            style={{
              background: inputToken.trim() ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
              border: `1px solid ${inputToken.trim() ? 'var(--accent-cyan)' : 'var(--bg-surface-border)'}`,
              color: inputToken.trim() ? 'var(--accent-cyan)' : 'var(--text-muted)',
              padding: '0.85rem 1.25rem',
              fontWeight: 700,
              fontSize: '0.85rem',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            JOIN <ArrowRight size={16} />
          </button>
        </form>
      </div>

      {/* Security Principles Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        width: '100%',
        marginTop: '1rem',
        textAlign: 'left',
      }}>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--bg-surface-border)',
          padding: '1rem',
          borderRadius: '2px',
        }}>
          <Lock size={18} style={{ color: 'var(--accent-cyan)', marginBottom: '0.5rem' }} />
          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.25rem' }}>NO ACCOUNTS</h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Instant session without registration or email.</p>
        </div>

        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--bg-surface-border)',
          padding: '1rem',
          borderRadius: '2px',
        }}>
          <Zap size={18} style={{ color: 'var(--accent-green)', marginBottom: '0.5rem' }} />
          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.25rem' }}>ZERO PERSISTENCE</h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Files move live between devices and vanish.</p>
        </div>

        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--bg-surface-border)',
          padding: '1rem',
          borderRadius: '2px',
        }}>
          <Smartphone size={18} style={{ color: 'var(--accent-cyan)', marginBottom: '0.5rem' }} />
          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.25rem' }}>ONE-TIME QR</h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cryptographic pairing token expires automatically.</p>
        </div>
      </div>
    </div>
  );
}

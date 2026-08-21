import React from 'react';
import { Smartphone, Check, X, ShieldAlert } from 'lucide-react';

export function PairingModal({ onAccept, onReject }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(8, 8, 10, 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200,
      padding: '1.5rem',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--accent-cyan)',
        padding: '2rem',
        maxWidth: '440px',
        width: '100%',
        borderRadius: '4px',
        boxShadow: '0 0 50px rgba(0, 240, 255, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '1.5rem',
      }} className="swiss-grid-bg">
        <div style={{
          width: '64px',
          height: '64px',
          background: 'var(--accent-cyan-glow)',
          border: '1px solid var(--accent-cyan)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-cyan)',
        }} className="animate-pulse-glow">
          <Smartphone size={32} />
        </div>

        <div>
          <span className="mono" style={{
            fontSize: '0.7rem',
            color: 'var(--accent-cyan)',
            fontWeight: 700,
            letterSpacing: '0.15em',
            display: 'block',
            marginBottom: '0.5rem',
          }}>
            SECURITY CHECK
          </span>
          <h3 style={{
            fontSize: '1.5rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            marginBottom: '0.5rem',
          }}>
            DEVICE WANTS TO CONNECT
          </h3>
          <p style={{
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
            lineHeight: 1.5,
          }}>
            A mobile/remote device scanned your QR code and requested a direct pairing session.
          </p>
        </div>

        <div style={{
          display: 'flex',
          gap: '1rem',
          width: '100%',
          marginTop: '0.5rem',
        }}>
          <button
            onClick={onReject}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid var(--accent-red)',
              color: 'var(--accent-red)',
              padding: '0.85rem',
              fontWeight: 700,
              fontSize: '0.85rem',
              letterSpacing: '0.08em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              borderRadius: '2px',
            }}
          >
            <X size={18} />
            REJECT
          </button>

          <button
            onClick={onAccept}
            style={{
              flex: 1,
              background: 'var(--accent-cyan)',
              color: '#08080a',
              padding: '0.85rem',
              fontWeight: 800,
              fontSize: '0.85rem',
              letterSpacing: '0.08em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              borderRadius: '2px',
              boxShadow: '0 0 20px var(--accent-cyan-glow)',
            }}
          >
            <Check size={18} />
            ACCEPT
          </button>
        </div>
      </div>
    </div>
  );
}

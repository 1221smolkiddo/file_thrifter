import React from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';

export function PairingModal({ onAccept, onReject }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(11, 11, 10, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--accent-lime)',
        borderRadius: '4px',
        padding: '2.5rem 2rem',
        boxShadow: '0 0 40px var(--accent-lime-glow)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }} className="swiss-grid-bg">
        
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'var(--bg-primary)',
          border: '1px solid var(--accent-lime)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-lime)',
          marginBottom: '1.5rem',
        }}>
          <ShieldAlert size={32} />
        </div>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.75rem', letterSpacing: '0.02em' }}>
          CONNECTION REQUEST
        </h2>
        
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '2.5rem', lineHeight: 1.5 }}>
          A peer is attempting to establish a secure, ephemeral connection with your session.
        </p>

        <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
          <button
            onClick={onReject}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid var(--bg-surface-border)',
              color: 'var(--text-primary)',
              padding: '0.85rem',
              fontWeight: 700,
              fontSize: '0.8rem',
              letterSpacing: '0.05em',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <X size={16} />
            REJECT
          </button>
          
          <button
            onClick={onAccept}
            style={{
              flex: 1,
              background: 'var(--accent-lime)',
              border: 'none',
              color: 'var(--bg-primary)',
              padding: '0.85rem',
              fontWeight: 800,
              fontSize: '0.8rem',
              letterSpacing: '0.05em',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <Check size={16} />
            ACCEPT
          </button>
        </div>
      </div>
    </div>
  );
}

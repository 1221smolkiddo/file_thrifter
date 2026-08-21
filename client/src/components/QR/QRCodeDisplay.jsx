import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Clock } from 'lucide-react';

export function QRCodeDisplay({ sessionData }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  const { displayId, sessionToken, expiresAt } = sessionData;

  const qrUrl = `${window.location.origin}/?token=${sessionToken}`;

  useEffect(() => {
    if (!canvasRef.current || !sessionToken) return;

    QRCode.toCanvas(canvasRef.current, qrUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0B0B0A',
        light: '#FFFFFF',
      },
    }, (error) => {
      if (error) console.error('[THRIFT] QR code error:', error);
    });
  }, [qrUrl, sessionToken]);

  useEffect(() => {
    if (!expiresAt) return;

    const updateTimer = () => {
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        setTimeLeft('00:00');
        return;
      }

      const minutes = Math.floor(remainingMs / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);
      setTimeLeft(
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      width: '100%',
      aspectRatio: '1/1',
      background: 'var(--bg-surface)',
      border: '1px solid var(--bg-surface-border)',
      borderRadius: '4px',
      display: 'flex',
      flexDirection: 'column',
      padding: '2rem',
      position: 'relative',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
      }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          SCAN TO CONNECT
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-lime)' }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-lime)',
            display: 'inline-block',
          }} className="animate-pulse-glow" />
          <span className="mono" style={{ fontSize: '0.7rem', fontWeight: 600 }}>SESSION ACTIVE</span>
        </div>
      </div>

      <div style={{
        background: '#FFFFFF',
        padding: '0.75rem',
        borderRadius: '4px',
        alignSelf: 'center',
        marginBottom: 'auto',
      }}>
        <canvas ref={canvasRef} style={{ width: '100%', maxWidth: '240px', height: 'auto', display: 'block' }} />
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginTop: '1.5rem',
      }}>
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }} className="mono">ID</div>
          <div className="mono" style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '0.1em',
            lineHeight: 1,
          }}>
            {displayId}
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
            <Clock size={12} />
            <span className="mono" style={{ fontSize: '0.75rem' }}>{timeLeft}</span>
          </div>

          <button
            onClick={handleCopyLink}
            style={{
              background: copied ? 'var(--text-primary)' : 'transparent',
              border: `1px solid ${copied ? 'var(--text-primary)' : 'var(--bg-surface-border)'}`,
              color: copied ? 'var(--bg-primary)' : 'var(--text-secondary)',
              padding: '0.35rem 0.6rem',
              fontSize: '0.7rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              borderRadius: '2px',
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
      </div>
    </div>
  );
}

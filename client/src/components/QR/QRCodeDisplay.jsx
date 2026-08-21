import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, QrCode, Clock } from 'lucide-react';

export function QRCodeDisplay({ sessionData }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  const { displayId, sessionToken, expiresAt } = sessionData;

  // Build deployment-safe QR URL containing secret sessionToken
  const qrUrl = `${window.location.origin}/?token=${sessionToken}`;

  useEffect(() => {
    if (!canvasRef.current || !sessionToken) return;

    QRCode.toCanvas(canvasRef.current, qrUrl, {
      width: 240,
      margin: 2,
      color: {
        dark: '#08080a',
        light: '#ffffff',
      },
    }, (error) => {
      if (error) console.error('[THRIFT] QR code error:', error);
    });
  }, [qrUrl, sessionToken]);

  // Countdown timer calculation
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
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '1.5rem',
      maxWidth: '420px',
      margin: '0 auto',
      width: '100%',
    }}>
      <div style={{
        textAlign: 'center',
      }}>
        <h2 style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          marginBottom: '0.25rem',
        }}>
          SCAN TO CONNECT
        </h2>
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
          fontWeight: 500,
        }}>
          Point phone camera at QR code to pair devices instantly
        </p>
      </div>

      <div style={{
        background: '#ffffff',
        padding: '1.25rem',
        borderRadius: '4px',
        boxShadow: '0 0 40px rgba(0, 240, 255, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        <canvas ref={canvasRef} style={{ width: '100%', maxWidth: '240px', height: 'auto' }} />
      </div>

      {/* Session Display ID + Expiration readout */}
      <div style={{
        width: '100%',
        background: 'var(--bg-surface)',
        border: '1px solid var(--bg-surface-border)',
        padding: '1rem',
        borderRadius: '2px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--bg-surface-border)',
          paddingBottom: '0.75rem',
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            SESSION ID
          </span>
          <span className="mono" style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            color: 'var(--accent-cyan)',
            letterSpacing: '0.15em',
          }}>
            {displayId}
          </span>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)' }}>
            <Clock size={14} />
            <span style={{ fontSize: '0.75rem' }}>Expires in:</span>
            <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              {timeLeft}
            </span>
          </div>

          <button
            onClick={handleCopyLink}
            style={{
              background: copied ? 'var(--accent-green-glow)' : 'var(--bg-surface-hover)',
              border: `1px solid ${copied ? 'var(--accent-green)' : 'var(--bg-surface-border)'}`,
              color: copied ? 'var(--accent-green)' : 'var(--text-primary)',
              padding: '0.4rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              borderRadius: '2px',
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'COPIED' : 'COPY LINK'}
          </button>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        color: 'var(--accent-cyan)',
        fontSize: '0.8rem',
        fontWeight: 600,
        letterSpacing: '0.05em',
      }} className="mono animate-pulse-glow">
        <QrCode size={16} />
        <span>WAITING FOR DEVICE TO SCAN...</span>
      </div>
    </div>
  );
}

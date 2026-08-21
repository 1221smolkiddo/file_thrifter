import React, { useEffect, useRef } from 'react';
import { Laptop, Smartphone, FileText, CheckCircle2, ShieldCheck, Zap, ArrowRight } from 'lucide-react';

export function TransferVisualizer({ transferPayload, isHost, onBlastAnother }) {
  const containerRef = useRef(null);

  const {
    fileInfo = { name: 'Unknown', size: 0, type: 'file' },
    transferredBytes = 0,
    totalBytes = 0,
    percentage = 0,
    speedMbps = '0.0',
    status = 'TRANSFERRING',
  } = transferPayload || {};

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  const isCompleted = status === 'COMPLETED' || percentage >= 100;
  const isSender = status === 'SENDING' || (isHost && status !== 'RECEIVING');

  // Dynamic particle speed: faster speedMbps = faster dash animation
  const animDuration = Math.max(0.4, 2.5 - Math.min(2.0, parseFloat(speedMbps) / 20));

  return (
    <div style={{
      width: '100%',
      maxWidth: '680px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
    }} ref={containerRef}>
      
      {/* Visualizer Connection Line & Nodes */}
      <div style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${isCompleted ? 'var(--accent-green)' : 'var(--bg-surface-border)'}`,
        borderRadius: '4px',
        padding: '2rem 1.5rem',
        position: 'relative',
        boxShadow: isCompleted 
          ? '0 0 30px var(--accent-green-glow)' 
          : '0 0 30px var(--accent-cyan-glow)',
        transition: 'all 0.3s ease',
      }} className="swiss-grid-bg">
        
        {/* Connection Header Metadata */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          fontSize: '0.75rem',
        }} className="mono">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-green)' }}>
            <ShieldCheck size={14} />
            <span>DIRECT CONNECTION (SIMULATED)</span>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            SECURE ENCRYPTED TRANSPORT
          </div>
        </div>

        {/* Dynamic Data Flow Nodes */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          padding: '0 1rem',
        }}>
          {/* Node 1: Sender */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
            zIndex: 2,
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              background: 'var(--bg-primary)',
              border: `2px solid ${isSender ? 'var(--accent-cyan)' : 'var(--bg-surface-border)'}`,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isSender ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            }}>
              {isHost ? <Laptop size={26} /> : <Smartphone size={26} />}
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }} className="mono">
              {isHost ? 'LAPTOP (HOST)' : 'PHONE (PEER)'}
            </span>
          </div>

          {/* Animated Connecting Vector / Data Stream */}
          <div style={{
            flex: 1,
            height: '40px',
            position: 'relative',
            margin: '0 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              {/* Background trace line */}
              <line
                x1="0"
                y1="50%"
                x2="100%"
                y2="50%"
                stroke="var(--bg-surface-border)"
                strokeWidth="3"
                strokeDasharray="4 4"
              />
              
              {/* Animated particle flow stroke */}
              {!isCompleted && (
                <line
                  x1="0"
                  y1="50%"
                  x2="100%"
                  y2="50%"
                  stroke="var(--accent-cyan)"
                  strokeWidth="3"
                  strokeDasharray="12 12"
                  style={{
                    animation: `dashFlow ${animDuration}s linear infinite`,
                  }}
                />
              )}

              {/* Completed stroke */}
              {isCompleted && (
                <line
                  x1="0"
                  y1="50%"
                  x2="100%"
                  y2="50%"
                  stroke="var(--accent-green)"
                  strokeWidth="4"
                />
              )}
            </svg>

            {/* Floating Speed Meter Pill */}
            {!isCompleted && (
              <div style={{
                position: 'absolute',
                top: '-18px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--accent-cyan)',
                color: 'var(--accent-cyan)',
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 700,
              }} className="mono">
                {speedMbps} MB/s
              </div>
            )}
          </div>

          {/* Node 2: Receiver */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
            zIndex: 2,
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              background: 'var(--bg-primary)',
              border: `2px solid ${isCompleted ? 'var(--accent-green)' : 'var(--bg-surface-border)'}`,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isCompleted ? 'var(--accent-green)' : 'var(--text-secondary)',
            }}>
              {!isHost ? <Laptop size={26} /> : <Smartphone size={26} />}
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }} className="mono">
              {!isHost ? 'LAPTOP (HOST)' : 'PHONE (PEER)'}
            </span>
          </div>
        </div>

        {/* File & Transfer Progress Readout */}
        <div style={{
          marginTop: '2.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}>
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.25rem',
              }}>
                <FileText size={18} style={{ color: 'var(--accent-cyan)' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, wordBreak: 'break-all' }}>
                  {fileInfo.name}
                </h3>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }} className="mono">
                Total size: {formatSize(totalBytes)}
              </span>
            </div>

            <div style={{ textAlign: 'right' }} className="mono">
              <span style={{
                fontSize: '1.75rem',
                fontWeight: 800,
                color: isCompleted ? 'var(--accent-green)' : 'var(--accent-cyan)',
              }}>
                {percentage}%
              </span>
            </div>
          </div>

          {/* Progress Bar Container */}
          <div style={{
            width: '100%',
            height: '10px',
            background: 'var(--bg-primary)',
            borderRadius: '5px',
            overflow: 'hidden',
            border: '1px solid var(--bg-surface-border)',
            position: 'relative',
          }}>
            <div style={{
              width: `${percentage}%`,
              height: '100%',
              background: isCompleted
                ? 'linear-gradient(90deg, #00f0ff, #00ff9d)'
                : 'linear-gradient(90deg, rgba(0,240,255,0.4), #00f0ff)',
              transition: 'width 0.1s linear',
              boxShadow: '0 0 12px var(--accent-cyan)',
            }} />
          </div>

          {/* Bottom Statistics Row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
          }} className="mono">
            <span>
              {formatSize(transferredBytes)} / {formatSize(totalBytes)}
            </span>
            <span>
              {isCompleted ? (
                <span style={{ color: 'var(--accent-green)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <CheckCircle2 size={14} /> TRANSFERRED WITH ZERO TRACE
                </span>
              ) : (
                `SPEED: ${speedMbps} MB/s`
              )}
            </span>
          </div>
        </div>

      </div>

      {/* Completion Action */}
      {isCompleted && (
        <button
          onClick={onBlastAnother}
          style={{
            background: 'var(--accent-green)',
            color: '#08080a',
            padding: '1rem',
            fontWeight: 800,
            fontSize: '0.95rem',
            letterSpacing: '0.08em',
            borderRadius: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            boxShadow: '0 0 20px var(--accent-green-glow)',
            width: '100%',
          }}
        >
          <Zap size={20} />
          BLAST ANOTHER FILE
        </button>
      )}

      {/* Custom CSS Animation Keyframe for vector dash stream */}
      <style>{`
        @keyframes dashFlow {
          from {
            stroke-dashoffset: 24;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}

import React, { useRef, useState } from 'react';
import {
  Laptop,
  Smartphone,
  FileText,
  CheckCircle2,
  Download,
  ShieldCheck,
  Zap,
  Copy,
  Check,
  ExternalLink,
  Link as LinkIcon,
} from 'lucide-react';

export function TransferVisualizer({ transferPayload, isHost, transferRole, onBlastAnother }) {
  const containerRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const {
    fileInfo = { name: 'Unknown', size: 0, type: 'file' },
    transferredBytes = 0,
    totalBytes = 0,
    percentage = 0,
    speedMbps = '0.0',
    status = 'TRANSFERRING',
    downloadUrl,
    errorMessage,
  } = transferPayload || {};

  const isLink = Boolean(
    fileInfo.isLink ||
    (fileInfo.content && /^(?:https?:\/\/|www\.)[^\s]+$/i.test(fileInfo.content.trim()))
  );
  const hasTextContent = Boolean(fileInfo.content);

  const handleCopyContent = async () => {
    if (!fileInfo.content) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(fileInfo.content);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = fileInfo.content;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[THRIFT] Copy failed:', err);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  const isError = status === 'ERROR';
  const isCompleted = ['COMPLETED', 'SENT', 'RECEIVED'].includes(status);
  const isSender = transferRole === 'SENDER' || ['SENDING', 'SENT'].includes(status);
  const resultLabel = status === 'SENT'
    ? (isLink ? 'LINK SENT SUCCESSFULLY' : hasTextContent ? 'TEXT SENT SUCCESSFULLY' : 'FILE SENT SUCCESSFULLY')
    : status === 'RECEIVED'
      ? (isLink ? 'LINK RECEIVED SUCCESSFULLY' : hasTextContent ? 'TEXT RECEIVED SUCCESSFULLY' : 'FILE RECEIVED SUCCESSFULLY')
      : isError ? 'TRANSFER FAILED' : null;

  const animDuration = Math.max(0.4, 2.5 - Math.min(2.0, parseFloat(speedMbps) / 20));
  const linkHref = isLink && fileInfo.content
    ? (fileInfo.content.trim().startsWith('http') ? fileInfo.content.trim() : `https://${fileInfo.content.trim()}`)
    : null;

  return (
    <div style={{
      width: '100%',
      maxWidth: '640px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.85rem',
    }} ref={containerRef}>
      
      <div style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${isError ? 'var(--accent-red)' : isCompleted ? 'var(--text-primary)' : 'var(--bg-surface-border)'}`,
        borderRadius: '4px',
        padding: '1.25rem 1.5rem',
        position: 'relative',
        boxShadow: isCompleted 
          ? '0 0 30px rgba(242, 240, 234, 0.05)' 
          : 'none',
        transition: 'all 0.3s ease',
      }} className="swiss-grid-bg">
        
        <div style={{
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          marginBottom: '1rem',
          fontSize: '0.72rem',
        }} className="mono">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
            <ShieldCheck size={13} />
            <span>DIRECT CONNECTION</span>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          padding: '0 0.5rem',
        }}>
          {/* Sender Node */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.35rem',
            zIndex: 2,
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              background: 'var(--bg-primary)',
              border: `2px solid ${isSender ? 'var(--accent-lime)' : 'var(--bg-surface-border)'}`,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isSender ? 'var(--accent-lime)' : 'var(--text-secondary)',
            }}>
              {isHost ? <Laptop size={22} /> : <Smartphone size={22} />}
            </div>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)' }} className="mono">
              {isHost ? 'LAPTOP' : 'PHONE'}
            </span>
          </div>

          {/* Stream */}
          <div style={{
            flex: 1,
            height: '32px',
            position: 'relative',
            margin: '0 0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              <line
                x1="0" y1="50%" x2="100%" y2="50%"
                stroke="var(--bg-surface-border)" strokeWidth="3" strokeDasharray="4 4"
              />
              {!isCompleted && !isError && (
                <line
                  x1="0" y1="50%" x2="100%" y2="50%"
                  stroke="var(--accent-lime)" strokeWidth="3" strokeDasharray="12 12"
                  style={{ animation: `dashFlow ${animDuration}s linear infinite` }}
                />
              )}
              {isCompleted && (
                <line
                  x1="0" y1="50%" x2="100%" y2="50%"
                  stroke="var(--text-primary)" strokeWidth="3.5"
                />
              )}
            </svg>

            {!isCompleted && !isError && (
              <div style={{
                position: 'absolute',
                top: '-15px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--accent-lime)',
                color: 'var(--accent-lime)',
                padding: '0.15rem 0.5rem',
                borderRadius: '10px',
                fontSize: '0.7rem',
                fontWeight: 700,
              }} className="mono">
                {speedMbps} MB/s
              </div>
            )}
          </div>

          {/* Receiver Node */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.35rem',
            zIndex: 2,
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              background: 'var(--bg-primary)',
              border: `2px solid ${isCompleted ? 'var(--text-primary)' : 'var(--bg-surface-border)'}`,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isCompleted ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}>
              {!isHost ? <Laptop size={22} /> : <Smartphone size={22} />}
            </div>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)' }} className="mono">
              {!isHost ? 'LAPTOP' : 'PHONE'}
            </span>
          </div>
        </div>

        {/* Progress */}
        <div style={{
          marginTop: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
                {isLink ? (
                  <LinkIcon size={16} style={{ color: 'var(--accent-lime)' }} />
                ) : (
                  <FileText size={16} style={{ color: 'var(--accent-lime)' }} />
                )}
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, wordBreak: 'break-all' }}>{fileInfo.name}</h3>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }} className="mono">
                Total size: {formatSize(totalBytes)}
              </span>
            </div>
            <div style={{ textAlign: 'right' }} className="mono">
              <span style={{
                fontSize: '1.4rem',
                fontWeight: 800,
                color: isError ? 'var(--accent-red)' : isCompleted ? 'var(--text-primary)' : 'var(--accent-lime)',
              }}>
                {percentage}%
              </span>
            </div>
          </div>

          <div style={{
            width: '100%',
            height: '8px',
            background: 'var(--bg-primary)',
            borderRadius: '4px',
            overflow: 'hidden',
            border: '1px solid var(--bg-surface-border)',
            position: 'relative',
          }}>
            <div style={{
              width: `${percentage}%`,
              height: '100%',
              background: isError ? 'var(--accent-red)' : isCompleted ? 'var(--text-primary)' : 'var(--accent-lime)',
              transition: 'width 0.1s linear',
              boxShadow: isCompleted ? 'none' : '0 0 12px var(--accent-lime-glow)',
            }} />
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.7rem',
            color: 'var(--text-secondary)',
          }} className="mono">
            <span>{formatSize(transferredBytes)} / {formatSize(totalBytes)}</span>
            <span>
              {resultLabel ? (
                <span style={{ color: isError ? 'var(--accent-red)' : 'var(--text-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {!isError && <CheckCircle2 size={13} />} {resultLabel}
                </span>
              ) : `SPEED: ${speedMbps} MB/s`}
            </span>
          </div>

          {isError && <p role="alert" style={{ margin: 0, color: 'var(--accent-red)', fontSize: '0.75rem' }} className="mono">{errorMessage || 'The transfer could not be completed.'}</p>}

          {fileInfo.content && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-primary)',
              border: '1px solid var(--bg-surface-border)',
              borderRadius: '3px',
              overflow: 'hidden',
              marginTop: '0.2rem',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.35rem 0.65rem',
                borderBottom: '1px solid var(--bg-surface-border)',
                background: 'rgba(255, 255, 255, 0.02)',
                fontSize: '0.68rem',
              }} className="mono">
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {isLink ? 'SHARED LINK' : 'SHARED TEXT'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {linkHref && (
                    <a
                      href={linkHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--bg-surface-border)',
                        color: 'var(--text-secondary)',
                        padding: '0.15rem 0.4rem',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        borderRadius: '2px',
                        textDecoration: 'none',
                      }}
                      title="Open link in new tab"
                    >
                      <ExternalLink size={11} />
                      OPEN
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyContent}
                    style={{
                      background: copied ? 'var(--accent-lime)' : 'transparent',
                      border: `1px solid ${copied ? 'var(--accent-lime)' : 'var(--bg-surface-border)'}`,
                      color: copied ? 'var(--bg-primary)' : 'var(--text-primary)',
                      padding: '0.15rem 0.45rem',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                    title="Copy to clipboard"
                  >
                    {copied ? <Check size={11} /> : <Copy size={11} />}
                    {copied ? 'COPIED!' : 'COPY'}
                  </button>
                </div>
              </div>
              <div style={{
                maxHeight: '100px',
                overflowY: 'auto',
                padding: '0.65rem',
                background: 'var(--bg-primary)',
              }}>
                <pre style={{
                  margin: 0,
                  padding: 0,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  color: isLink ? 'var(--accent-lime)' : 'var(--text-primary)',
                  fontSize: '0.8rem',
                  lineHeight: 1.45,
                  fontFamily: 'var(--font-mono)',
                  userSelect: 'text',
                }}>
                  {fileInfo.content}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {(isCompleted || isError) && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: (isSender && fileInfo.content && !downloadUrl) ? 'repeat(auto-fit, minmax(180px, 1fr))' : '1fr',
          gap: '0.65rem',
          width: '100%',
        }}>
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={fileInfo.name}
              style={{
                background: 'var(--accent-lime)',
                color: 'var(--bg-primary)',
                padding: '0.8rem',
                fontWeight: 800,
                fontSize: '0.85rem',
                letterSpacing: '0.06em',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                textDecoration: 'none',
              }}
            >
              <Download size={17} />
              DOWNLOAD FILE
            </a>
          )}
          {fileInfo.content && !downloadUrl && (
            <button
              type="button"
              onClick={handleCopyContent}
              style={{
                background: copied ? 'var(--accent-lime)' : 'var(--text-primary)',
                color: 'var(--bg-primary)',
                padding: '0.8rem',
                fontWeight: 800,
                fontSize: '0.85rem',
                letterSpacing: '0.06em',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
              }}
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}
              {copied
                ? (isLink ? 'LINK COPIED' : 'TEXT COPIED')
                : (isLink ? 'COPY LINK' : 'COPY TEXT')}
            </button>
          )}
          {(isSender || isError) && (
            <button
              onClick={onBlastAnother}
              style={{
                background: (downloadUrl || fileInfo.content) ? 'var(--bg-surface)' : 'var(--text-primary)',
                color: (downloadUrl || fileInfo.content) ? 'var(--text-primary)' : 'var(--bg-primary)',
                border: (downloadUrl || fileInfo.content) ? '1px solid var(--bg-surface-border)' : 'none',
                padding: '0.8rem',
                fontWeight: 800,
                fontSize: '0.85rem',
                letterSpacing: '0.06em',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
              }}
            >
              <Zap size={17} />
              TRANSFER ANOTHER
            </button>
          )}
        </div>
      )}

      <style>{`
        @keyframes dashFlow {
          from { stroke-dashoffset: 24; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}

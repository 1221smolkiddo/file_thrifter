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
  Files,
  Archive,
  Image as ImageIcon,
  Music,
  Video,
  Code,
  Clock,
  Loader2,
} from 'lucide-react';
import { zipSync } from 'fflate';
import { BorderGlow } from '../Common/BorderGlow';


function getFileIcon(fileName = '', mimeType = '') {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'avif'].includes(ext) || mimeType.startsWith('image/')) {
    return <ImageIcon size={15} style={{ color: 'var(--accent-lime)' }} />;
  }
  if (['zip', 'rar', 'tar', 'gz', '7z', 'bz2'].includes(ext) || mimeType.includes('zip') || mimeType.includes('compressed')) {
    return <Archive size={15} style={{ color: 'var(--accent-lime)' }} />;
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext) || mimeType.startsWith('audio/')) {
    return <Music size={15} style={{ color: 'var(--accent-lime)' }} />;
  }
  if (['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext) || mimeType.startsWith('video/')) {
    return <Video size={15} style={{ color: 'var(--accent-lime)' }} />;
  }
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'rs', 'go', 'cpp', 'c', 'sh', 'sql'].includes(ext)) {
    return <Code size={15} style={{ color: 'var(--accent-lime)' }} />;
  }
  return <FileText size={15} style={{ color: 'var(--accent-lime)' }} />;
}

export function TransferVisualizer({ transferPayload, isHost, transferRole, onBlastAnother }) {
  const containerRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  const {
    isBatch = false,
    totalFiles = 1,
    totalBytes = 0,
    transferredBytes = 0,
    percentage = 0,
    speedMbps = '0.0',
    status = 'TRANSFERRING',
    files = [],
    activeFileIndex = 0,
    currentFile = null,
    fileInfo = { name: 'Unknown', size: 0, type: 'file' },
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

  const handleDownloadZip = async () => {
    const downloadableFiles = files.filter((f) => f.blob || f.downloadUrl);
    if (downloadableFiles.length === 0) return;

    setIsZipping(true);
    try {
      const zipEntries = {};
      for (let i = 0; i < downloadableFiles.length; i++) {
        const f = downloadableFiles[i];
        let blob = f.blob;
        if (!blob && f.downloadUrl) {
          const res = await fetch(f.downloadUrl);
          blob = await res.blob();
        }

        if (blob) {
          const arrayBuf = await blob.arrayBuffer();
          let name = f.name || `file_${i + 1}`;
          if (zipEntries[name]) {
            const dotIdx = name.lastIndexOf('.');
            const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
            const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
            let count = 1;
            while (zipEntries[`${base}_${count}${ext}`]) count++;
            name = `${base}_${count}${ext}`;
          }
          zipEntries[name] = new Uint8Array(arrayBuf);
        }
      }

      const zipped = zipSync(zipEntries);
      const zipBlob = new Blob([zipped], { type: 'application/zip' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `thrift_bundle_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error('[THRIFT] Failed to generate zip:', err);
    } finally {
      setIsZipping(false);
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
  const isTransferring = !isCompleted && !isError;

  const displayTitle = isBatch
    ? `${totalFiles} FILE${totalFiles > 1 ? 'S' : ''} (${formatSize(totalBytes)})`
    : fileInfo.name;

  const resultLabel = status === 'SENT'
    ? (isLink ? 'LINK SENT SUCCESSFULLY' : hasTextContent ? 'TEXT SENT SUCCESSFULLY' : isBatch ? `${totalFiles} FILES SENT SUCCESSFULLY` : 'FILE SENT SUCCESSFULLY')
    : status === 'RECEIVED'
      ? (isLink ? 'LINK RECEIVED SUCCESSFULLY' : hasTextContent ? 'TEXT RECEIVED SUCCESSFULLY' : isBatch ? `${totalFiles} FILES RECEIVED SUCCESSFULLY` : 'FILE RECEIVED SUCCESSFULLY')
      : isError ? 'TRANSFER FAILED' : null;

  const animDuration = Math.max(0.4, 2.5 - Math.min(2.0, parseFloat(speedMbps) / 20));
  const linkHref = isLink && fileInfo.content
    ? (fileInfo.content.trim().startsWith('http') ? fileInfo.content.trim() : `https://${fileInfo.content.trim()}`)
    : null;

  const hasMultipleFiles = isBatch && files.length > 1;
  const completedDownloadableCount = files.filter((f) => f.downloadUrl || f.blob).length;

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
          : isTransferring
            ? '0 0 24px rgba(183, 255, 90, 0.04)'
            : 'none',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }} className="swiss-grid-bg">
        
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          fontSize: '0.72rem',
        }} className="mono">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
            <ShieldCheck size={13} style={{ color: 'var(--accent-lime)' }} />
            <span>DIRECT P2P CONNECTION</span>
          </div>
          {isBatch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--accent-lime)' }}>
              <Files size={12} />
              <span>BATCH TRANSFER ({totalFiles})</span>
            </div>
          )}
        </div>

        {/* Sender and Receiver Graphic */}
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
            <div
              className={isTransferring && isSender ? 'animate-radar-sender' : ''}
              style={{
                width: '46px',
                height: '46px',
                background: 'var(--bg-primary)',
                border: `2px solid ${isSender ? 'var(--accent-lime)' : 'var(--bg-surface-border)'}`,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isSender ? 'var(--accent-lime)' : 'var(--text-secondary)',
                transition: 'all 0.3s ease',
              }}
            >
              {isHost ? <Laptop size={22} /> : <Smartphone size={22} />}
            </div>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)' }} className="mono">
              {isHost ? 'LAPTOP' : 'PHONE'}
            </span>
          </div>

          {/* Stream Pipeline */}
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
              <defs>
                <linearGradient id="streamGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--accent-lime)" stopOpacity="0.3" />
                  <stop offset="50%" stopColor="var(--accent-lime)" stopOpacity="1" />
                  <stop offset="100%" stopColor="var(--accent-lime)" stopOpacity="0.8" />
                </linearGradient>
              </defs>

              {/* Base line */}
              <line
                x1="0" y1="50%" x2="100%" y2="50%"
                stroke="var(--bg-surface-border)" strokeWidth="3" strokeDasharray="4 4"
              />

              {/* Active data packet flow */}
              {isTransferring && (
                <>
                  <line
                    x1="0" y1="50%" x2="100%" y2="50%"
                    stroke="url(#streamGlow)" strokeWidth="3.5" strokeDasharray="10 10"
                    style={{
                      animation: `dashFlow ${animDuration}s linear infinite`,
                      filter: 'drop-shadow(0 0 6px var(--accent-lime))',
                    }}
                  />
                  <circle
                    r="3.5"
                    fill="var(--accent-lime)"
                    style={{
                      filter: 'drop-shadow(0 0 8px #B7FF5A)',
                      animation: `dashFlow ${animDuration * 0.8}s ease-in-out infinite`,
                    }}
                    cx="50%"
                    cy="50%"
                  />
                </>
              )}

              {/* Completed solid bridge */}
              {isCompleted && (
                <line
                  x1="0" y1="50%" x2="100%" y2="50%"
                  stroke="var(--text-primary)" strokeWidth="3.5"
                  style={{
                    filter: 'drop-shadow(0 0 4px rgba(242, 240, 234, 0.4))',
                    transition: 'all 0.4s ease',
                  }}
                />
              )}
            </svg>

            {isTransferring && (
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
                boxShadow: '0 0 10px var(--accent-lime-glow)',
                animation: 'slideUpFade 0.2s ease',
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
            <div
              className={`${isTransferring && !isSender ? 'animate-radar-receiver' : ''} ${isCompleted ? 'animate-success-pop' : ''}`}
              style={{
                width: '46px',
                height: '46px',
                background: 'var(--bg-primary)',
                border: `2px solid ${isCompleted ? 'var(--text-primary)' : isTransferring && !isSender ? 'var(--accent-lime)' : 'var(--bg-surface-border)'}`,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isCompleted ? 'var(--text-primary)' : isTransferring && !isSender ? 'var(--accent-lime)' : 'var(--text-secondary)',
                boxShadow: isCompleted ? '0 0 16px rgba(242, 240, 234, 0.2)' : 'none',
                transition: 'all 0.3s ease',
              }}
            >
              {!isHost ? <Laptop size={22} /> : <Smartphone size={22} />}
            </div>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)' }} className="mono">
              {!isHost ? 'LAPTOP' : 'PHONE'}
            </span>
          </div>
        </div>

        {/* Progress & Title Section */}
        <div style={{
          marginTop: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
                {isBatch ? (
                  <Files size={16} style={{ color: 'var(--accent-lime)' }} />
                ) : isLink ? (
                  <LinkIcon size={16} style={{ color: 'var(--accent-lime)' }} />
                ) : (
                  <FileText size={16} style={{ color: 'var(--accent-lime)' }} />
                )}
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, wordBreak: 'break-all' }}>
                  {displayTitle}
                </h3>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }} className="mono">
                {isBatch
                  ? `${formatSize(transferredBytes)} / ${formatSize(totalBytes)}`
                  : `Total size: ${formatSize(totalBytes)}`}
              </span>
            </div>
            <div style={{ textAlign: 'right' }} className="mono">
              <span style={{
                fontSize: '1.4rem',
                fontWeight: 800,
                color: isError ? 'var(--accent-red)' : isCompleted ? 'var(--text-primary)' : 'var(--accent-lime)',
                transition: 'color 0.3s ease',
              }}>
                {percentage}%
              </span>
            </div>
          </div>

          {/* Progress Bar */}
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
              background: isError 
                ? 'var(--accent-red)' 
                : isCompleted 
                  ? 'var(--text-primary)' 
                  : 'linear-gradient(90deg, #99e63c 0%, #b7ff5a 50%, #d8ff94 100%)',
              transition: 'width 0.15s ease-out',
              boxShadow: isCompleted ? 'none' : '0 0 14px var(--accent-lime-glow)',
              position: 'relative',
            }} />
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.7rem',
            color: 'var(--text-secondary)',
          }} className="mono">
            <span>
              {isBatch && currentFile && isTransferring
                ? `STREAMING (${activeFileIndex + 1}/${totalFiles}): ${currentFile.name}`
                : isBatch
                  ? `${totalFiles} Files`
                  : `${formatSize(transferredBytes)} / ${formatSize(totalBytes)}`}
            </span>
            <span>
              {resultLabel ? (
                <span className="animate-success-pop" style={{
                  color: isError ? 'var(--accent-red)' : 'var(--text-primary)',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}>
                  {!isError && <CheckCircle2 size={13} style={{ color: 'var(--accent-lime)' }} />} {resultLabel}
                </span>
              ) : `SPEED: ${speedMbps} MB/s`}
            </span>
          </div>

          {isError && <p role="alert" style={{ margin: 0, color: 'var(--accent-red)', fontSize: '0.75rem' }} className="mono">{errorMessage || 'The transfer could not be completed.'}</p>}

          {/* Multi-File Queue List */}
          {isBatch && files.length > 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              marginTop: '0.5rem',
              maxHeight: '180px',
              overflowY: 'auto',
              background: 'var(--bg-primary)',
              border: '1px solid var(--bg-surface-border)',
              borderRadius: '4px',
              padding: '0.5rem',
            }}>
              {files.map((file, idx) => {
                const fileDone = file.status === 'COMPLETED';
                const fileActive = file.status === 'TRANSFERRING';


                return (
                  <div
                    key={file.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.4rem 0.6rem',
                      background: fileActive ? 'rgba(183, 255, 90, 0.05)' : 'transparent',
                      border: `1px solid ${fileActive ? 'rgba(183, 255, 90, 0.3)' : 'transparent'}`,
                      borderRadius: '3px',
                      fontSize: '0.75rem',
                    }}
                    className="mono"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', overflow: 'hidden', flex: 1 }}>
                      {getFileIcon(file.name, file.type)}
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: fileActive ? 'var(--accent-lime)' : fileDone ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}>
                        {file.name}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                        {formatSize(file.size)}
                      </span>

                      {fileDone ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <CheckCircle2 size={13} style={{ color: 'var(--accent-lime)' }} />
                          {file.downloadUrl && (
                            <a
                              href={file.downloadUrl}
                              download={file.name}
                              className="border-glow-btn"
                              style={{
                                padding: '0.15rem 0.45rem',
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                textDecoration: 'none',
                                color: 'var(--text-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                              }}
                              title="Download this file"
                            >
                              <Download size={11} /> GET
                            </a>
                          )}
                        </div>
                      ) : fileActive ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--accent-lime)' }}>
                          <Loader2 size={12} className="animate-spin" />
                          <span>{file.percentage || 0}%</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: 'var(--text-muted)' }}>
                          <Clock size={12} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Shared Text / Link Panel */}
          {fileInfo.content && (
            <div className="animate-slide-up" style={{
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-primary)',
              border: '1px solid var(--bg-surface-border)',
              borderRadius: '3px',
              overflow: 'hidden',
              marginTop: '0.2rem',
              transition: 'border-color 0.2s ease',
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
                      className="border-glow-btn"
                      style={{
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        gap: '0.25rem',
                        textDecoration: 'none',
                        color: 'var(--text-primary)',
                      }}
                      title="Open link in new tab"
                    >
                      <ExternalLink size={11} className="icon-arrow" />
                      OPEN
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyContent}
                    className={copied ? 'btn-lime' : 'border-glow-btn'}
                    style={{
                      padding: '0.2rem 0.55rem',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      gap: '0.25rem',
                      color: copied ? 'var(--bg-primary)' : 'var(--text-primary)',
                    }}
                    title="Copy to clipboard"
                  >
                    {copied ? <Check size={11} className="icon-copy" /> : <Copy size={11} className="icon-copy" />}
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

      {/* Action Buttons */}
      {(isCompleted || isError) && (
        <div className="animate-slide-up" style={{
          display: 'grid',
          gridTemplateColumns: (hasMultipleFiles && completedDownloadableCount > 1 && !isSender) || (isSender && fileInfo.content && !downloadUrl) ? 'repeat(auto-fit, minmax(180px, 1fr))' : '1fr',
          gap: '0.65rem',
          width: '100%',
        }}>
          {/* Download All as ZIP (Receiver side for batch > 1) */}
          {hasMultipleFiles && completedDownloadableCount > 1 && !isSender && (
            <BorderGlow
              as="button"
              onClick={handleDownloadZip}
              disabled={isZipping}
              glowColor="var(--accent-lime)"
              backgroundColor="var(--accent-lime)"
              alwaysActive={true}
              speed={2.6}
              style={{ width: '100%' }}
            >
              <div
                style={{
                  padding: '0.85rem 1rem',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  color: 'var(--bg-primary)',
                  letterSpacing: '0.06em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                  width: '100%',
                }}
              >
                {isZipping ? <Loader2 size={18} className="animate-spin" /> : <Archive size={18} className="icon-download" />}
                {isZipping ? 'CREATING ZIP...' : `DOWNLOAD ALL (${completedDownloadableCount} AS .ZIP)`}
              </div>
            </BorderGlow>
          )}

          {/* Single File Direct Download */}
          {!hasMultipleFiles && downloadUrl && (
            <BorderGlow
              as="a"
              href={downloadUrl}
              download={fileInfo.name}
              glowColor="var(--accent-lime)"
              backgroundColor="var(--accent-lime)"
              alwaysActive={true}
              speed={2.6}
              style={{ width: '100%', textDecoration: 'none' }}
            >
              <div
                style={{
                  padding: '0.85rem 1rem',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  color: 'var(--bg-primary)',
                  letterSpacing: '0.06em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                  width: '100%',
                }}
              >
                <Download size={18} className="icon-download" />
                DOWNLOAD FILE
              </div>
            </BorderGlow>
          )}

          {/* Copy Text / Link Action */}
          {fileInfo.content && !downloadUrl && !isBatch && (
            <BorderGlow
              as="button"
              type="button"
              onClick={handleCopyContent}
              glowColor="var(--accent-lime)"
              backgroundColor={copied ? 'var(--accent-lime)' : 'var(--text-primary)'}
              alwaysActive={true}
              speed={2.6}
              style={{ width: '100%' }}
            >
              <div
                style={{
                  padding: '0.85rem 1rem',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  color: 'var(--bg-primary)',
                  letterSpacing: '0.06em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.45rem',
                  width: '100%',
                }}
              >
                {copied ? <Check size={18} className="icon-copy" /> : <Copy size={18} className="icon-copy" />}
                {copied
                  ? (isLink ? 'LINK COPIED' : 'TEXT COPIED')
                  : (isLink ? 'COPY LINK' : 'COPY TEXT')}
              </div>
            </BorderGlow>
          )}

          {/* Transfer Another Action */}
          <BorderGlow
            as="button"
            onClick={onBlastAnother}
            glowColor="var(--accent-lime)"
            secondaryColor="#ffffff"
            backgroundColor="var(--bg-surface)"
            pointerTracked={true}
            style={{ width: '100%' }}
          >
            <div
              style={{
                padding: '0.85rem 1rem',
                fontSize: '0.88rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                letterSpacing: '0.06em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                width: '100%',
              }}
            >
              <Zap size={18} className="icon-zap" />
              TRANSFER ANOTHER
            </div>
          </BorderGlow>
        </div>
      )}
    </div>
  );
}


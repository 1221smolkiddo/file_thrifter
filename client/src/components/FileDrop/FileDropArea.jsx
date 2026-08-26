import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UploadCloud, Link as LinkIcon, ArrowRight, File, Plus, X, Files, Clipboard, CheckCircle2 } from 'lucide-react';
import { BorderGlow } from '../Common/BorderGlow';

const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
};

export function FileDropArea({ onFileSelected, onFilesSelected, onTextSend, p2pNotice }) {
  const [activeTab, setActiveTab] = useState('FILES'); // FILES | TEXT | LINK
  const [stagedFiles, setStagedFiles] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [pasteNotice, setPasteNotice] = useState('');
  
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);
  const activeTabRef = useRef(activeTab);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const addFilesToStage = useCallback((newFiles) => {
    if (!newFiles) return;
    const list = Array.isArray(newFiles) ? newFiles : Array.from(newFiles);
    const valid = list.filter((f) => f && (f instanceof Blob || (typeof f.size === 'number' && typeof f.name === 'string')));
    if (valid.length === 0) return;
    setStagedFiles((prev) => [...prev, ...valid]);
  }, []);

  const removeStagedFile = (indexToRemove) => {
    setStagedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const clearStagedFiles = () => {
    setStagedFiles([]);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToStage(e.target.files);
      e.target.value = '';
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  // ─── Universal Drag and Drop across the entire box ───

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setActiveTab('FILES');
      addFilesToStage(e.dataTransfer.files);
    }
  };

  // ─── Master Clipboard Extraction ───

  const showPasteFeedback = useCallback((msg) => {
    setPasteNotice(msg);
    setTimeout(() => setPasteNotice(''), 3000);
  }, []);

  const tryReadSystemClipboard = useCallback(async () => {
    // Attempt 1: Modern Async Clipboard API for Files & Blobs
    if (navigator.clipboard?.read) {
      try {
        const clipboardItems = await navigator.clipboard.read();
        const filesFound = [];
        for (const item of clipboardItems) {
          for (const type of item.types) {
            if (type.startsWith('image/') || type === 'application/pdf' || type === 'application/octet-stream' || type === 'application/zip') {
              const blob = await item.getType(type);
              const ext = type.split('/')[1] || 'png';
              filesFound.push(new File([blob], `pasted_item_${Date.now()}.${ext}`, { type }));
            }
          }
        }
        if (filesFound.length > 0) {
          setActiveTab('FILES');
          addFilesToStage(filesFound);
          showPasteFeedback(`✓ ${filesFound.length} FILE(S) PASTED FROM CLIPBOARD`);
          return true;
        }
      } catch {
        // Fall through to text read
      }
    }

    // Attempt 2: Text / URL Read
    if (navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const trimmed = text.trim();
          const isUrl = /^(?:https?:\/\/|www\.)[^\s]+$/i.test(trimmed);
          if (isUrl) {
            setActiveTab('LINK');
            setLinkInput(trimmed);
            showPasteFeedback('✓ LINK PASTED FROM CLIPBOARD');
          } else {
            setActiveTab('TEXT');
            setTextInput((prev) => (prev ? `${prev}\n${text}` : text));
            showPasteFeedback('✓ TEXT PASTED FROM CLIPBOARD');
          }
          return true;
        }
      } catch (err) {
        console.warn('[THRIFT] Clipboard readText failed:', err);
      }
    }
    return false;
  }, [addFilesToStage, showPasteFeedback]);

  // ─── Global Paste Event & Keydown Listeners ───

  useEffect(() => {
    const handlePasteEvent = (e) => {
      const target = e.target;
      const isTextInput = target && (
        (target.tagName === 'INPUT' && target.type !== 'file') ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );

      // Check for file payload in event
      let filesFound = [];
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        filesFound = Array.from(e.clipboardData.files);
      } else if (e.clipboardData?.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];
          if (item.kind === 'file') {
            const f = item.getAsFile();
            if (f) {
              if (!f.name || f.name === 'image.png' || f.name === 'blob') {
                const ext = f.type ? f.type.split('/')[1] || 'png' : 'png';
                filesFound.push(new File([f], `pasted_media_${Date.now()}.${ext}`, { type: f.type }));
              } else {
                filesFound.push(f);
              }
            }
          }
        }
      }

      if (filesFound.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        setActiveTab('FILES');
        addFilesToStage(filesFound);
        showPasteFeedback(`✓ ${filesFound.length} FILE(S) PASTED`);
        return;
      }

      // If no file found and not inside active input, process text/link
      if (!isTextInput) {
        const text = e.clipboardData?.getData('text/plain') || e.clipboardData?.getData('text');
        if (text && text.trim()) {
          const trimmed = text.trim();
          const isUrl = /^(?:https?:\/\/|www\.)[^\s]+$/i.test(trimmed);

          if (isUrl) {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('LINK');
            setLinkInput(trimmed);
            showPasteFeedback('✓ LINK PASTED');
          } else {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('TEXT');
            setTextInput((prev) => (prev ? `${prev}\n${text}` : text));
            showPasteFeedback('✓ TEXT PASTED');
          }
        }
      }
    };

    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        const target = e.target;
        const isTextInput = target && (
          (target.tagName === 'INPUT' && target.type !== 'file') ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        );

        if (!isTextInput) {
          // Trigger clipboard read if paste event does not fire automatically
          setTimeout(() => {
            tryReadSystemClipboard();
          }, 50);
        }
      }
    };

    document.addEventListener('paste', handlePasteEvent, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('paste', handlePasteEvent, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [addFilesToStage, showPasteFeedback, tryReadSystemClipboard]);

  const handleSendStagedFiles = () => {
    if (stagedFiles.length === 0) return;
    const sendFn = onFilesSelected || onFileSelected;
    if (sendFn) {
      sendFn(stagedFiles);
      setStagedFiles([]);
    }
  };

  const handleBlastText = (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    if (onTextSend(textInput)) {
      setTextInput('');
    }
  };

  const handleBlastLink = (e) => {
    e.preventDefault();
    if (!linkInput.trim()) return;
    if (onTextSend(linkInput)) {
      setLinkInput('');
    }
  };

  const totalStagedSize = stagedFiles.reduce((acc, f) => acc + (f.size || 0), 0);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        width: '100%',
        maxWidth: '660px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        position: 'relative',
      }}
    >
      {/* Hidden file input invoked via ref without capturing DOM focus */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Editorial Tab Selector */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--bg-surface-border)',
        paddingBottom: '0.65rem',
      }}>
        <div style={{ display: 'flex', gap: '2rem' }}>
          {['FILES', 'TEXT', 'LINK'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'transparent',
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab ? '2px solid var(--accent-lime)' : '2px solid transparent',
                padding: '0.25rem 0',
                fontSize: '0.8rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                transition: 'all 0.2s ease',
              }}
              className="mono"
              onMouseEnter={(e) => {
                if (activeTab !== tab) e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab) e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Prominent, Enhanced Paste Button with clear border */}
        <button
          type="button"
          onClick={tryReadSystemClipboard}
          className="btn-paste-pill mono"
          title="Paste files, images, text, or links from clipboard (Ctrl+V)"
        >
          <Clipboard size={14} />
          <span>PASTE (CTRL+V)</span>
        </button>
      </div>

      {/* Paste Feedback Toast */}
      {pasteNotice && (
        <div className="animate-slide-up" style={{
          background: 'rgba(183, 255, 90, 0.12)',
          border: '1px solid var(--accent-lime)',
          borderRadius: '4px',
          padding: '0.5rem 0.85rem',
          fontSize: '0.78rem',
          color: 'var(--accent-lime)',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
        }}>
          <CheckCircle2 size={14} />
          <span>{pasteNotice}</span>
        </div>
      )}

      {p2pNotice && (
        <p role="alert" style={{ margin: 0, color: 'var(--accent-red)', fontSize: '0.8rem' }} className="mono">
          {p2pNotice}
        </p>
      )}

      {/* Tab 1: FILES */}
      {activeTab === 'FILES' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
          {stagedFiles.length === 0 ? (
            <BorderGlow
              as="div"
              pointerTracked={true}
              alwaysActive={isDragging}
              glowColor="var(--accent-lime)"
              backgroundColor="var(--bg-surface)"
              borderRadius="4px"
              glowIntensity={24}
              style={{ width: '100%' }}
              onClick={openFilePicker}
            >
              <div
                style={{
                  width: '100%',
                  padding: '3.5rem 2rem',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '1.25rem',
                  cursor: 'pointer',
                  position: 'relative',
                }}
                className="swiss-grid-bg"
              >
                <div style={{
                  width: '64px',
                  height: '64px',
                  background: 'var(--bg-primary)',
                  border: `1px solid ${isDragging ? 'var(--accent-lime)' : 'var(--bg-surface-border)'}`,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isDragging ? 'var(--accent-lime)' : 'var(--text-primary)',
                  transition: 'all 0.2s ease',
                  animation: isDragging ? 'floatBob 1.5s ease-in-out infinite' : 'none',
                }}>
                  <UploadCloud size={26} />
                </div>

                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                    {isDragging ? 'DROP TO ADD FILES' : 'DROP FILES HERE'}
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    select, drag, or paste multiple files (Ctrl+V)
                  </p>
                </div>

                <div
                  className="btn-primary touch-target"
                  style={{
                    padding: '0.85rem 1.75rem',
                    fontSize: '0.85rem',
                    letterSpacing: '0.05em',
                    marginTop: '0.5rem',
                    pointerEvents: 'none',
                  }}
                >
                  SELECT FILES <ArrowRight size={16} className="icon-arrow" />
                </div>
              </div>
            </BorderGlow>
          ) : (
            <BorderGlow
              as="div"
              alwaysActive={isDragging}
              glowColor="var(--accent-lime)"
              backgroundColor="var(--bg-surface)"
              borderRadius="4px"
              style={{ width: '100%' }}
            >
              <div
                className="animate-slide-up swiss-grid-bg"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  padding: '1.25rem',
                  position: 'relative',
                }}
              >
                {/* Drag over overlay when files are already staged */}
                {isDragging && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(11, 11, 10, 0.92)',
                    zIndex: 10,
                    borderRadius: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    color: 'var(--accent-lime)',
                    pointerEvents: 'none',
                  }} className="mono animate-fade-in">
                    <UploadCloud size={32} className="animate-pulse-glow" />
                    <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>+ DROP TO ADD MORE FILES</span>
                  </div>
                )}

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--bg-surface-border)',
                  paddingBottom: '0.75rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} className="mono">
                    <Files size={16} style={{ color: 'var(--accent-lime)' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      {stagedFiles.length} FILE{stagedFiles.length > 1 ? 'S' : ''} SELECTED
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      ({formatSize(totalStagedSize)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={clearStagedFiles}
                    style={{
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                    className="mono"
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-red)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  >
                    CLEAR ALL
                  </button>
                </div>

                {/* Scrollable Staged Files List */}
                <div style={{
                  maxHeight: '320px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}>
                  {stagedFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--bg-surface-border)',
                        borderRadius: '4px',
                        padding: '0.65rem 0.85rem',
                        fontSize: '0.82rem',
                        gap: '0.75rem',
                      }}
                      className="mono"
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', flex: 1, minWidth: 0 }}>
                        <File size={16} style={{ color: 'var(--accent-lime)', flexShrink: 0, marginTop: '2px' }} />
                        <span style={{
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                          lineHeight: '1.45',
                          color: 'var(--text-primary)',
                        }}>
                          {file.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0, marginTop: '2px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          {formatSize(file.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeStagedFile(idx)}
                          style={{
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            padding: '0.15rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: '3px',
                          }}
                          title="Remove file"
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-red)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions: Add more + Send Button */}
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="btn-surface"
                    style={{
                      padding: '0.85rem 1rem',
                      fontSize: '0.85rem',
                      letterSpacing: '0.05em',
                      height: '100%',
                    }}
                  >
                    <Plus size={16} /> ADD MORE
                  </button>

                  <BorderGlow
                    as="button"
                    onClick={handleSendStagedFiles}
                    glowColor="var(--accent-lime)"
                    backgroundColor="var(--text-primary)"
                    alwaysActive={true}
                    speed={2.8}
                    style={{ width: '100%' }}
                  >
                    <div
                      style={{
                        padding: '0.85rem 1.25rem',
                        fontSize: '0.85rem',
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
                      SEND {stagedFiles.length} FILE{stagedFiles.length > 1 ? 'S' : ''} <ArrowRight size={16} className="icon-arrow" />
                    </div>
                  </BorderGlow>
                </div>
              </div>
            </BorderGlow>
          )}
        </div>
      )}

      {/* Tab 2: TEXT */}
      {activeTab === 'TEXT' && (
        <form onSubmit={handleBlastText} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-slide-up">
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type or paste confidential notes..."
            rows={7}
            style={{
              width: '100%',
              padding: '1.25rem',
              fontSize: '0.9rem',
              borderRadius: '4px',
              resize: 'vertical',
            }}
            className="mono"
          />
          <BorderGlow
            as="button"
            type="submit"
            disabled={!textInput.trim()}
            glowColor="var(--accent-lime)"
            backgroundColor={textInput.trim() ? 'var(--text-primary)' : 'var(--bg-surface-border)'}
            alwaysActive={Boolean(textInput.trim())}
            style={{ width: '100%', opacity: textInput.trim() ? 1 : 0.5 }}
          >
            <div
              style={{
                padding: '0.95rem',
                fontSize: '0.85rem',
                fontWeight: 800,
                color: textInput.trim() ? 'var(--bg-primary)' : 'var(--text-muted)',
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
              }}
            >
              SEND TEXT <ArrowRight size={16} className="icon-arrow" />
            </div>
          </BorderGlow>
        </form>
      )}

      {/* Tab 3: LINK */}
      {activeTab === 'LINK' && (
        <form onSubmit={handleBlastLink} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-slide-up">
          <div style={{ position: 'relative' }}>
            <LinkIcon size={18} style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary)',
            }} />
            <input
              type="url"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="https://example.com"
              style={{
                width: '100%',
                padding: '1rem 1rem 1rem 3rem',
                fontSize: '0.9rem',
                borderRadius: '4px',
              }}
              className="mono"
            />
          </div>
          <BorderGlow
            as="button"
            type="submit"
            disabled={!linkInput.trim()}
            glowColor="var(--accent-lime)"
            backgroundColor={linkInput.trim() ? 'var(--text-primary)' : 'var(--bg-surface-border)'}
            alwaysActive={Boolean(linkInput.trim())}
            style={{ width: '100%', opacity: linkInput.trim() ? 1 : 0.5 }}
          >
            <div
              style={{
                padding: '0.95rem',
                fontSize: '0.85rem',
                fontWeight: 800,
                color: linkInput.trim() ? 'var(--bg-primary)' : 'var(--text-muted)',
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
              }}
            >
              SEND LINK <ArrowRight size={16} className="icon-arrow" />
            </div>
          </BorderGlow>
        </form>
      )}
    </div>
  );
}




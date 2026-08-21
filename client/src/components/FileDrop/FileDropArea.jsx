import React, { useState } from 'react';
import { UploadCloud, Link as LinkIcon, Zap, ArrowRight } from 'lucide-react';

export function FileDropArea({ onFileSelected }) {
  const [activeTab, setActiveTab] = useState('FILES'); // FILES | TEXT | LINK
  const [textInput, setTextInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      onFileSelected({
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
      });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      onFileSelected({
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
      });
    }
  };

  const handleBlastText = (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    const textBlobSize = new Blob([textInput]).size;
    onFileSelected({
      name: 'pasted_text.txt',
      size: textBlobSize,
      type: 'text/plain',
      content: textInput,
    });
  };

  const handleBlastLink = (e) => {
    e.preventDefault();
    if (!linkInput.trim()) return;
    const linkSize = new Blob([linkInput]).size;
    onFileSelected({
      name: 'shared_link.url',
      size: linkSize,
      type: 'text/uri-list',
      content: linkInput,
    });
  };

  return (
    <div style={{
      width: '100%',
      maxWidth: '600px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
    }}>
      {/* Editorial Tab Selector */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--bg-surface-border)',
        paddingBottom: '0.5rem',
        gap: '2rem',
      }}>
        {['FILES', 'TEXT', 'LINK'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'transparent',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab ? '2px solid var(--text-primary)' : '2px solid transparent',
              padding: '0.25rem 0',
              fontSize: '0.8rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}
            className="mono"
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab 1: FILES */}
      {activeTab === 'FILES' && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            background: isDragging ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
            border: `1px solid ${isDragging ? 'var(--accent-lime)' : 'var(--bg-surface-border)'}`,
            borderRadius: '4px',
            padding: '4rem 2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.5rem',
            transition: 'all 0.2s ease',
            cursor: 'pointer',
            position: 'relative',
          }}
          className="swiss-grid-bg"
        >
          <input
            type="file"
            onChange={handleFileChange}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
          />

          <div style={{
            width: '64px',
            height: '64px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--bg-surface-border)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)',
          }}>
            <UploadCloud size={24} />
          </div>

          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              DROP FILES HERE
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              or click to browse
            </p>
          </div>

          <div style={{
            background: 'var(--text-primary)',
            color: 'var(--bg-primary)',
            padding: '0.85rem 1.75rem',
            fontWeight: 800,
            fontSize: '0.85rem',
            letterSpacing: '0.05em',
            borderRadius: '2px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '0.5rem',
          }} className="touch-target">
            SELECT FILE <ArrowRight size={16} />
          </div>
        </div>
      )}

      {/* Tab 2: TEXT */}
      {activeTab === 'TEXT' && (
        <form onSubmit={handleBlastText} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type or paste confidential notes..."
            rows={8}
            style={{
              width: '100%',
              padding: '1.25rem',
              fontSize: '0.9rem',
              borderRadius: '4px',
              resize: 'vertical',
            }}
            className="mono"
          />
          <button
            type="submit"
            disabled={!textInput.trim()}
            style={{
              background: textInput.trim() ? 'var(--text-primary)' : 'var(--bg-surface-border)',
              color: textInput.trim() ? 'var(--bg-primary)' : 'var(--text-muted)',
              padding: '1rem',
              fontWeight: 800,
              fontSize: '0.85rem',
              letterSpacing: '0.05em',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            SEND TEXT <ArrowRight size={16} />
          </button>
        </form>
      )}

      {/* Tab 3: LINK */}
      {activeTab === 'LINK' && (
        <form onSubmit={handleBlastLink} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
          <button
            type="submit"
            disabled={!linkInput.trim()}
            style={{
              background: linkInput.trim() ? 'var(--text-primary)' : 'var(--bg-surface-border)',
              color: linkInput.trim() ? 'var(--bg-primary)' : 'var(--text-muted)',
              padding: '1rem',
              fontWeight: 800,
              fontSize: '0.85rem',
              letterSpacing: '0.05em',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            SEND LINK <ArrowRight size={16} />
          </button>
        </form>
      )}
    </div>
  );
}

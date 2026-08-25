import React, { useState } from 'react';
import { UploadCloud, Link as LinkIcon, ArrowRight } from 'lucide-react';
import { BorderGlow } from '../Common/BorderGlow';

export function FileDropArea({ onFileSelected, onTextSend, p2pNotice }) {
  const [activeTab, setActiveTab] = useState('FILES'); // FILES | TEXT | LINK
  const [textInput, setTextInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      onFileSelected(file);
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
      onFileSelected(file);
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

      {p2pNotice && (
        <p role="alert" style={{ margin: 0, color: 'var(--accent-red)', fontSize: '0.8rem' }} className="mono">
          {p2pNotice}
        </p>
      )}

      {/* Tab 1: FILES */}
      {activeTab === 'FILES' && (
        <BorderGlow
          as="div"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          pointerTracked={true}
          alwaysActive={isDragging}
          glowColor="var(--accent-lime)"
          backgroundColor="var(--bg-surface)"
          borderRadius="4px"
          glowIntensity={24}
          style={{ width: '100%' }}
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
            <input
              type="file"
              onChange={handleFileChange}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', zIndex: 3 }}
            />

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
                DROP FILES HERE
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                or click to browse
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
              SELECT FILE <ArrowRight size={16} className="icon-arrow" />
            </div>
          </div>
        </BorderGlow>
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

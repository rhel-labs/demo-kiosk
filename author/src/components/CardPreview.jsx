import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, ModalHeader, ModalBody, ModalFooter, Button,
} from '@patternfly/react-core';

// Matches the kiosk's renderMarkdown — bold, links, lists, paragraphs
function renderMarkdown(text) {
  let s = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
    `<a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  const lines = s.split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    const m = line.match(/^[-*]\s+(.+)/);
    if (m) { if (!inList) { out.push('<ul>'); inList = true; } out.push(`<li>${m[1]}</li>`); }
    else { if (inList) { out.push('</ul>'); inList = false; } out.push(line); }
  }
  if (inList) out.push('</ul>');
  return out.join('\n').split(/\n{2,}/).map(block => {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('<ul>') || block.startsWith('<p>')) return block;
    return `<p>${block}</p>`;
  }).join('\n');
}


// Replicates the kiosk grid background + one card tile
function KioskCardTile({ title, summary }) {
  return (
    <div style={{
      background: '#f2f2f2',
      padding: '1.5rem 1.5rem 0.75rem',
      borderRadius: 4,
    }}>
      <div style={{
        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: '#6a6e73', marginBottom: '0.75rem',
      }}>
        Card tile on the kiosk grid
      </div>
      {/* One card, matching kiosk dimensions */}
      <div style={{
        background: '#fff',
        border: '1px solid #d2d2d2',
        borderRadius: 6,
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        height: 200,            /* scaled down from kiosk's 280px for the authoring preview */
        overflow: 'hidden',
        padding: '1rem 1.25rem',
        maxWidth: 320,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}>
        <div style={{
          fontSize: '1.1rem',   /* kiosk: 1.25rem — slightly scaled for the preview */
          lineHeight: 1.35,
          fontWeight: 600,
          color: '#151515',
        }}>
          {title || <span style={{ color: '#aaa', fontStyle: 'italic', fontWeight: 400 }}>No title yet</span>}
        </div>
        {summary && (
          <div style={{ fontSize: '0.9rem', color: '#6a6e73', lineHeight: 1.5 }}>
            {summary}
          </div>
        )}
      </div>
    </div>
  );
}

// Replicates the kiosk popup modal (PF modal-box)
function KioskPopup({ title, children }) {
  return (
    <div>
      <div style={{
        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: '#6a6e73', marginBottom: '0.75rem',
      }}>
        Popup when the card is clicked
      </div>
      <div style={{
        border: '1px solid #d2d2d2',
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}>
        {/* PF modal-box__header */}
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #d2d2d2',
          background: '#fff',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#151515' }}>
            {title || <span style={{ color: '#aaa', fontStyle: 'italic', fontWeight: 400 }}>No title yet</span>}
          </h2>
        </div>
        {/* PF modal-box__body — kiosk uses flex column, center-aligned content */}
        <div style={{
          padding: '1.5rem',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

async function fileToObjectUrl(file) {
  if (!file) return null;
  if (file instanceof Blob) return URL.createObjectURL(file);

  // ZipEntryFile — try a direct Blob.slice() for STORE entries first.
  // Videos are always STORE (already compressed), so this avoids reading
  // the entire file into JS memory which causes silent failure for large files.
  if (file._sourceFile instanceof Blob && file._entry != null) {
    const e = file._entry;
    try {
      const lhBuf = await file._sourceFile.slice(e.localOff, e.localOff + 30).arrayBuffer();
      const lh = new DataView(lhBuf);
      const dataStart = e.localOff + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      if (e.compressType === 0) {
        const blob = file._sourceFile.slice(dataStart, dataStart + e.compSize,
          file.type || 'application/octet-stream');
        return URL.createObjectURL(blob);
      }
    } catch { /* fall through to stream path */ }
  }

  // DEFLATE entries (text files) — small enough to stream into memory
  if (typeof file.stream !== 'function') return null;
  try {
    const reader = file.stream().getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const blob = new Blob(chunks, { type: file.type || 'application/octet-stream' });
    return URL.createObjectURL(blob);
  } catch { return null; }
}

export default function CardPreview({ card, onClose }) {
  const srcRef = useRef(null);
  const [mediaSrc, setMediaSrc] = useState(null);
  const [mediaLoading, setMediaLoading] = useState(false);

  useEffect(() => {
    setMediaSrc(null);
    setMediaLoading(false);
    const { demo } = card;
    const file = demo?._mediaFile || demo?._videoFiles?.[0] || null;
    if (!file) return;
    let cancelled = false;
    setMediaLoading(true);
    fileToObjectUrl(file).then(url => {
      if (cancelled) { if (url) URL.revokeObjectURL(url); return; }
      if (srcRef.current) URL.revokeObjectURL(srcRef.current);
      srcRef.current = url;
      setMediaSrc(url);
      setMediaLoading(false);
    }).catch(() => {
      if (!cancelled) setMediaLoading(false);
    });
    return () => {
      cancelled = true;
      if (srcRef.current) { URL.revokeObjectURL(srcRef.current); srcRef.current = null; }
    };
  }, [card]);

  const { demo } = card;
  const { type } = demo;

  // Video-loop is an ambient reel launched from the header, not a grid card
  if (type === 'video-loop') {
    const files = demo._videoFiles || [];
    return (
      <Modal isOpen onClose={onClose} variant="large" aria-label="Card preview">
        <ModalHeader title="Video Loop preview" description="Ambient reel — plays from the header button, not shown on the card grid" />
        <ModalBody>
          {!files.length
            ? <p style={{ color: '#6a6e73' }}>No video files attached yet.</p>
            : mediaLoading
              ? <p style={{ color: '#6a6e73' }}>Loading…</p>
              : mediaSrc
                ? <>
                    <video controls style={{ width: '100%', maxHeight: 450, background: '#000', borderRadius: 6 }} src={mediaSrc} />
                    {files.length > 1 && (
                      <div style={{ fontSize: '0.8rem', color: '#6a6e73', marginTop: 6 }}>
                        Showing 1 of {files.length} videos in the loop.
                      </div>
                    )}
                  </>
                : <p style={{ color: '#6a6e73' }}>Could not load video for preview.</p>
          }
        </ModalBody>
        <ModalFooter><Button variant="primary" onClick={onClose}>Close</Button></ModalFooter>
      </Modal>
    );
  }

  function renderPopupBody() {
    const filename = name =>
      name ? name.split('/').pop() : null;
    const noFile = msg => (
      <p style={{ color: '#6a6e73', alignSelf: 'flex-start' }}>{msg}</p>
    );

    if (type === 'video') {
      if (!demo._mediaFile) return noFile(demo.src ? `File: ${filename(demo.src)}` : 'No video file attached yet.');
      if (mediaLoading) return noFile('Loading…');
      if (!mediaSrc) return noFile(`File: ${demo._mediaFile.name}`);
      return <video controls style={{ width: '100%', borderRadius: 6, background: '#000' }} src={mediaSrc} />;
    }

    if (type === 'slides') {
      if (!demo._mediaFile) return noFile(demo.src ? `File: ${filename(demo.src)}` : 'No PDF attached yet.');
      if (mediaLoading) return noFile('Loading…');
      if (!mediaSrc) return noFile(`File: ${demo._mediaFile.name}`);
      return <iframe src={mediaSrc} style={{ width: '100%', height: 480, border: 'none', borderRadius: 6 }} title="Slides preview" />;
    }

    if (type === 'asciinema') {
      return (
        <div style={{
          width: '100%', padding: '2.5rem 2rem', textAlign: 'center',
          color: '#c5c5c5', background: '#1e1e1e', borderRadius: 6,
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>▶</div>
          <div style={{ fontFamily: 'monospace', fontSize: '1rem' }}>Terminal recording</div>
          <div style={{ fontSize: '0.85rem', marginTop: 8, color: '#888' }}>
            {demo._mediaFile ? demo._mediaFile.name : demo.src ? filename(demo.src) : ''}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: 12, color: '#666' }}>
            Preview not available in the authoring tool — renders in the kiosk.
          </div>
        </div>
      );
    }

    if (type === 'image-text') {
      if (!demo._mediaFile) return noFile(demo.src ? `File: ${filename(demo.src)}` : 'No image attached yet.');
      if (mediaLoading) return noFile('Loading…');
      if (!mediaSrc) return noFile(`File: ${demo._mediaFile.name}`);
      return (
        <>
          <img src={mediaSrc} alt={card.title}
            style={{ width: '100%', borderRadius: 6, boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }} />
          {demo.caption && (
            <p style={{ margin: 0, fontSize: '1.05rem', color: '#6a6e73', textAlign: 'center', lineHeight: 1.6, maxWidth: 680 }}>
              {demo.caption}
            </p>
          )}
        </>
      );
    }

    if (type === 'external-url' || type === 'lab') {
      return (
        <>
          {demo.long_description
            ? <div style={{ width: '100%', maxWidth: 720, fontSize: '1.05rem', lineHeight: 1.7 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(demo.long_description) }} />
            : <p style={{ color: '#aaa', fontStyle: 'italic' }}>(no body text yet)</p>
          }
          {type === 'lab' && demo.duration && (
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#6a6e73' }}>
              &#x23f1; Estimated time: {demo.duration}
            </p>
          )}
          {demo.url && (
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#6a6e73', wordBreak: 'break-all' }}>
              {demo.url}
            </p>
          )}
          <a style={{
            display: 'inline-block',
            background: 'var(--pf-t--global--color--brand--default, #ee0000)',
            color: '#fff', padding: '0.5rem 1.5rem',
            borderRadius: 4, fontSize: '1rem', textDecoration: 'none', cursor: 'default',
          }}>
            {type === 'lab' ? 'Launch Lab ↗' : 'Open Link ↗'}
          </a>
        </>
      );
    }

    if (type === 'arcade') {
      return (
        <div style={{ alignSelf: 'flex-start', width: '100%' }}>
          <p style={{ margin: '0 0 8px', color: '#6a6e73', fontSize: '0.9rem' }}>
            Arcade demo — opens interactively in the kiosk popup
          </p>
          {demo.share_url
            ? <p style={{ margin: 0, wordBreak: 'break-all', fontSize: '0.95rem' }}>{demo.share_url}</p>
            : <p style={{ margin: 0, color: '#aaa', fontStyle: 'italic' }}>No share URL set yet.</p>
          }
        </div>
      );
    }

    return <p style={{ color: '#6a6e73' }}>No preview available for this card type.</p>;
  }

  return (
    <Modal isOpen onClose={onClose} variant="large" aria-label="Card preview">
      <ModalHeader title="Card preview" />
      <ModalBody style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <KioskCardTile title={card.title} summary={card.summary} />
        <KioskPopup title={card.title}>{renderPopupBody()}</KioskPopup>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}

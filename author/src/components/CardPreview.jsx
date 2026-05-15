import React, { useEffect, useRef } from 'react';
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

function arcadePaddingBottom(ratio) {
  if (!ratio) return 'calc(56.25% + 41px)';
  if (ratio.includes('%')) return `calc(${ratio} + 41px)`;
  const parts = ratio.split(':').map(Number);
  if (parts.length === 2 && parts[0] && parts[1]) return `calc(${(parts[1] / parts[0]) * 100}% + 41px)`;
  return 'calc(56.25% + 41px)';
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

export default function CardPreview({ card, onClose }) {
  const blobUrls = useRef([]);

  useEffect(() => () => { blobUrls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  function blobUrl(file) {
    const url = URL.createObjectURL(file);
    blobUrls.current.push(url);
    return url;
  }

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
            : !(files[0] instanceof Blob)
              ? <p style={{ color: '#6a6e73' }}>{files.length} video file{files.length > 1 ? 's' : ''} from bundle — re-attach to preview.</p>
              : <>
                  <video controls style={{ width: '100%', maxHeight: 450, background: '#000', borderRadius: 6 }} src={blobUrl(files[0])} />
                  {files.length > 1 && (
                    <div style={{ fontSize: '0.8rem', color: '#6a6e73', marginTop: 6 }}>
                      Showing 1 of {files.length} videos in the loop.
                    </div>
                  )}
                </>
          }
        </ModalBody>
        <ModalFooter><Button variant="primary" onClick={onClose}>Close</Button></ModalFooter>
      </Modal>
    );
  }

  function renderPopupBody() {
    if (type === 'video') {
      if (!(demo._mediaFile instanceof Blob)) return (
        <p style={{ color: '#6a6e73', alignSelf: 'flex-start' }}>
          {demo._mediaFile?.name
            ? `File from bundle: ${demo._mediaFile.name} — re-attach to preview.`
            : demo.src ? `File referenced by path: ${demo.src.split('/').pop()} — re-attach to embed it.` : 'No video file attached yet.'}
        </p>
      );
      return <video controls style={{ width: '100%', borderRadius: 6, background: '#000' }} src={blobUrl(demo._mediaFile)} />;
    }

    if (type === 'slides') {
      if (!(demo._mediaFile instanceof Blob)) return (
        <p style={{ color: '#6a6e73', alignSelf: 'flex-start' }}>
          {demo._mediaFile?.name
            ? `File from bundle: ${demo._mediaFile.name} — re-attach to preview.`
            : demo.src ? `File referenced by path: ${demo.src.split('/').pop()} — re-attach to embed it.` : 'No PDF attached yet.'}
        </p>
      );
      return <iframe src={blobUrl(demo._mediaFile)} style={{ width: '100%', height: 480, border: 'none', borderRadius: 6 }} title="Slides preview" />;
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
            {demo._mediaFile ? demo._mediaFile.name : demo.src ? demo.src.split('/').pop() : ''}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: 12, color: '#666' }}>
            Preview not available in the authoring tool — renders in the kiosk.
          </div>
        </div>
      );
    }

    if (type === 'image-text') {
      if (!(demo._mediaFile instanceof Blob)) return (
        <p style={{ color: '#6a6e73', alignSelf: 'flex-start' }}>
          {demo._mediaFile?.name
            ? `File from bundle: ${demo._mediaFile.name} — re-attach to preview.`
            : demo.src ? `File referenced by path: ${demo.src.split('/').pop()} — re-attach to embed it.` : 'No image attached yet.'}
        </p>
      );
      return (
        <>
          <img src={blobUrl(demo._mediaFile)} alt={card.title}
            style={{ width: '100%', borderRadius: 6, boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }} />
          {demo.caption && (
            <p style={{
              margin: 0, fontSize: '1.05rem', color: '#6a6e73',
              textAlign: 'center', lineHeight: 1.6, maxWidth: 680,
            }}>
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
      if (!demo.share_url) return <p style={{ color: '#6a6e73', alignSelf: 'flex-start' }}>No share URL set yet.</p>;
      return (
        <div style={{ width: '100%', position: 'relative', paddingBottom: arcadePaddingBottom(demo.aspect_ratio), height: 0, overflow: 'hidden', borderRadius: 6 }}>
          <iframe src={demo.share_url}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            title="Arcade demo preview" allowFullScreen />
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

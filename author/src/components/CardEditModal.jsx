import React, { useState, useRef } from 'react';
import {
  Modal, ModalHeader, ModalBody, ModalFooter,
  Form, FormGroup, TextInput, TextArea, Button, Label, Flex, FlexItem,
  Checkbox, FormSelect, FormSelectOption,
} from '@patternfly/react-core';
import { TrashIcon } from '@patternfly/react-icons';

const TYPE_META = {
  video:          { label: 'Video',        fileAccept: '.mp4,.webm',                fileHint: 'MP4 or WebM' },
  slides:         { label: 'Slides',       fileAccept: '.pdf',                      fileHint: 'PDF' },
  asciinema:      { label: 'Terminal',     fileAccept: '.cast',                     fileHint: '.cast file' },
  'image-text':   { label: 'Image',        fileAccept: '.png,.jpg,.jpeg,.svg,.webp',fileHint: 'PNG, JPG, SVG, WebP' },
  'external-url': { label: 'External URL', urlLabel: 'URL',       urlKey: 'url',       urlPlaceholder: 'https://example.com' },
  lab:            { label: 'Hands-on Lab', urlLabel: 'Lab URL',   urlKey: 'url',       urlPlaceholder: 'https://zero.rhdp.net/lab/your-lab-slug.prod' },
  arcade:         { label: 'Arcade Demo',  urlLabel: 'Share URL', urlKey: 'share_url', urlPlaceholder: 'https://interact.redhat.com/share/YOUR_FLOW_ID' },
  'video-loop':   { label: 'Video Loop' },
};

const FILE_TYPES = new Set(['video', 'slides', 'asciinema', 'image-text']);

const FAMILY_VALUES = ['RHEL', 'RHEL AI', 'OpenShift', 'OpenShift AI', 'OpenShift Virt', 'AAP', 'RHACS', 'Satellite', 'Lightspeed', 'Developer Hub', 'Quay', 'Red Hat AI', 'Edge'];

function slugify(v) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

function errText(msg) {
  return <div style={{ color: '#c9190b', fontSize: '0.8rem', marginTop: 4 }}>{msg}</div>;
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.05em', color: '#6a6e73',
      padding: '0.75rem 0 0.25rem',
      borderTop: '1px solid #d2d2d2',
      marginTop: '0.25rem',
    }}>
      {children}
    </div>
  );
}

function FileField({ type, demo, error, onChange }) {
  const inputRef = useRef(null);
  const meta = TYPE_META[type] || {};
  const file = demo?._mediaFile;

  return (
    <FormGroup label="File" fieldId="ef-file" isRequired>
      {file ? (
        <Flex alignItems={{ default: 'alignItemsCenter' }} style={{ gap: '0.5rem' }}>
          <FlexItem><Label color="green" isCompact>{file.name}</Label></FlexItem>
          <FlexItem>
            <span style={{ fontSize: '0.8rem', color: '#6a6e73' }}>
              ({(file.size / 1024 / 1024).toFixed(1)} MB)
            </span>
          </FlexItem>
          <FlexItem>
            <Button variant="link" size="sm" onClick={() => inputRef.current.click()}>Replace</Button>
          </FlexItem>
        </Flex>
      ) : (
        <Button variant="secondary" onClick={() => inputRef.current.click()}>
          Choose {meta.label} file
        </Button>
      )}
      <input ref={inputRef} type="file" accept={meta.fileAccept} style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files[0];
          if (f) onChange({ ...demo, _mediaFile: f });
          e.target.value = '';
        }} />
      {!file && <div style={{ fontSize: '0.8rem', color: '#6a6e73', marginTop: 4 }}>{meta.fileHint}</div>}
      {error && errText(error)}
    </FormGroup>
  );
}

function fmtMB(bytes) {
  const mb = bytes / 1024 / 1024;
  return mb < 1 ? '<1 MB' : `${Math.round(mb)} MB`;
}

function VideoLoopField({ demo, error, onChange }) {
  const inputRef = useRef(null);
  const [picking, setPicking] = useState(false);
  const [lastAdded, setLastAdded] = useState(0);
  const files = demo._videoFiles || [];
  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  function openPicker() {
    setPicking(true);
    inputRef.current.click();
  }

  return (
    <FormGroup label="Video files" fieldId="ef-videos" isRequired>
      <div style={{ marginBottom: 8 }}>
        {files.length === 0 && !picking && (
          <span style={{ color: error ? '#c9190b' : '#6a6e73', fontSize: '0.875rem' }}>
            No videos added yet
          </span>
        )}
        {picking && files.length === 0 && (
          <span style={{ color: '#6a6e73', fontSize: '0.875rem' }}>
            Waiting for file selection…
          </span>
        )}
        {files.map((f, i) => (
          <Flex key={i} alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: 4 }}>
            <FlexItem>
              <Label color="blue" isCompact>
                {f.name}
                <span style={{ opacity: 0.65, marginLeft: 6 }}>({fmtMB(f.size)})</span>
              </Label>
            </FlexItem>
            <FlexItem>
              <Button variant="plain" aria-label="Remove" onClick={() =>
                onChange({ ...demo, _videoFiles: files.filter((_, j) => j !== i) })}>
                <TrashIcon />
              </Button>
            </FlexItem>
          </Flex>
        ))}
        {files.length > 0 && (
          <div style={{ fontSize: '0.8rem', color: '#6a6e73', marginTop: 4 }}>
            {files.length} video{files.length !== 1 ? 's' : ''} · {fmtMB(totalBytes)} total
            {lastAdded > 0 && (
              <span style={{ color: '#3e8635', marginLeft: 8, fontWeight: 500 }}>
                +{lastAdded} added
              </span>
            )}
          </div>
        )}
      </div>
      <Button variant="secondary" onClick={openPicker}>Add videos</Button>
      <input ref={inputRef} type="file" accept=".mp4,.webm" multiple style={{ display: 'none' }}
        onChange={e => {
          const newFiles = [...e.target.files];
          setPicking(false);
          if (newFiles.length) {
            onChange({ ...demo, _videoFiles: [...files, ...newFiles] });
            setLastAdded(newFiles.length);
            setTimeout(() => setLastAdded(0), 3000);
          }
          e.target.value = '';
        }} />
      {error && errText(error)}
      <div style={{ fontSize: '0.8rem', color: '#6a6e73', marginTop: 4 }}>
        Videos play sequentially in a loop.
      </div>
    </FormGroup>
  );
}

export default function CardEditModal({ card: initialCard, onSave, onCancel }) {
  const [card, setCard] = useState(initialCard);
  const [attempted, setAttempted] = useState(false);
  const autoFillId = useRef(!initialCard.id);

  const type = card.demo?.type;
  const meta = TYPE_META[type] || {};
  const isFileType = FILE_TYPES.has(type);
  const isNew = !initialCard.title;

  function setDemo(key, val) {
    setCard(p => ({ ...p, demo: { ...p.demo, [key]: val } }));
  }

  function handleTitleChange(v) {
    setCard(p => ({
      ...p,
      title: v,
      ...(autoFillId.current ? { id: slugify(v) } : {}),
    }));
  }

  function isBlankUrl(v) {
    return !v || v.trim() === '' || v.trim() === 'https://' || v.trim() === 'http://';
  }

  function validate() {
    const e = {};
    if (!card.title?.trim()) e.title = 'Title is required';
    if (type !== 'video-loop' && !card.summary?.trim()) e.summary = 'Summary is required';
    if (isFileType && !card.demo?._mediaFile) e.file = `Choose a ${meta.label} file`;
    if ((type === 'external-url' || type === 'lab') && isBlankUrl(card.demo?.url)) e.url = 'URL is required';
    if (type === 'arcade' && isBlankUrl(card.demo?.share_url)) e.url = 'Share URL is required';
    if (type === 'video-loop' && !card.demo?._videoFiles?.length) e.videos = 'Add at least one video';
    return e;
  }

  function handleSave() {
    setAttempted(true);
    const errs = validate();
    if (Object.keys(errs).length) return;
    const { _isNew, ...clean } = card;
    onSave(clean);
  }

  const errs = attempted ? validate() : {};

  return (
    <Modal variant="medium" isOpen onClose={onCancel}>
      <ModalHeader title={`${isNew ? 'Add' : 'Edit'} ${meta.label || type}`} />
      <ModalBody>
        <Form>
          {/* ── Card tile (all types have a grid tile except video-loop) ── */}
          {type !== 'video-loop' && <SectionLabel>Card tile — visible on the grid</SectionLabel>}

          <FormGroup label="Title" fieldId="ef-title" isRequired>
            <TextInput id="ef-title" autoFocus
              value={card.title}
              onChange={(_e, v) => handleTitleChange(v)}
              validated={errs.title ? 'error' : 'default'}
              placeholder="Card title shown on the kiosk" />
            {errs.title && errText(errs.title)}
          </FormGroup>

          <FormGroup label="Card ID" fieldId="ef-id" isRequired
            helperText="Unique slug — auto-filled from title">
            <TextInput id="ef-id"
              value={card.id}
              onChange={(_e, v) => {
                autoFillId.current = false;
                setCard(p => ({ ...p, id: slugify(v) }));
              }}
              placeholder="my-card-id"
              style={{ maxWidth: 220 }} />
          </FormGroup>

          {type !== 'video-loop' && (
            <FormGroup label="Summary" fieldId="ef-summary" isRequired
              helperText="Shown below the title on the card grid tile">
              <TextArea id="ef-summary" rows={2}
                value={card.summary}
                onChange={(_e, v) => setCard(p => ({ ...p, summary: v }))}
                validated={errs.summary ? 'error' : 'default'}
                placeholder="Brief description." />
              {errs.summary && errText(errs.summary)}
            </FormGroup>
          )}

          {type !== 'video-loop' && (
            <FormGroup label="Featured" fieldId="ef-spotlight"
              helperText="Card appears in the Featured row above the main grid">
              <Checkbox
                id="ef-spotlight"
                label="Featured"
                isChecked={card.spotlight === true}
                onChange={(_e, checked) => {
                  if (checked) {
                    setCard(p => ({ ...p, spotlight: true }));
                  } else {
                    setCard(p => { const { spotlight, ...rest } = p; return rest; });
                  }
                }}
              />
            </FormGroup>
          )}

          {type !== 'video-loop' && (
            <FormGroup label="Product family" fieldId="ef-family"
              helperText="Shown as a label badge on the card tile">
              <FormSelect
                id="ef-family"
                value={card.family || ''}
                onChange={(_e, v) => setCard(p => ({ ...p, family: v }))}
                style={{ maxWidth: 260 }}
              >
                <FormSelectOption value="" label="None" />
                {FAMILY_VALUES.map(f => (
                  <FormSelectOption key={f} value={f} label={f} />
                ))}
              </FormSelect>
            </FormGroup>
          )}

          {/* ── Popup content (what the visitor sees when they click) ── */}
          {type !== 'video-loop' && (
            <SectionLabel>Popup — shown when visitor clicks the card</SectionLabel>
          )}

          {isFileType && (
            <FileField type={type} demo={card.demo} error={errs.file}
              onChange={d => setCard(p => ({ ...p, demo: d }))} />
          )}

          {type === 'image-text' && (
            <FormGroup label="Caption" fieldId="ef-caption"
              helperText="Optional — text shown alongside the image in the popup">
              <TextArea id="ef-caption" rows={3}
                value={card.demo?.caption || ''}
                onChange={(_e, v) => setDemo('caption', v)}
                placeholder="Describe what is shown in the image." />
            </FormGroup>
          )}

          {(type === 'external-url' || type === 'lab') && (
            <FormGroup label="Body text" fieldId="ef-details" isRequired
              helperText="Shown above the link button — supports **bold**, [links](url), and - lists">
              <TextArea id="ef-details" rows={5}
                value={card.demo?.long_description || ''}
                onChange={(_e, v) => setDemo('long_description', v)}
                placeholder="Describe the resource. Supports **bold**, [links](url), and - bullet lists." />
            </FormGroup>
          )}

          {type === 'lab' && (
            <FormGroup label="Estimated duration" fieldId="ef-duration"
              helperText="Optional — shown above the Launch Lab button">
              <TextInput id="ef-duration"
                value={card.demo?.duration || ''}
                onChange={(_e, v) => setDemo('duration', v)}
                placeholder="e.g. 30 minutes" />
            </FormGroup>
          )}

          {meta.urlKey && (
            <FormGroup label={meta.urlLabel} fieldId="ef-url" isRequired
              helperText={
                type === 'external-url' ? 'Opened by the "Open Link ↗" button'
                : type === 'lab'        ? 'Opened by the "Launch Lab ↗" button'
                : undefined
              }>
              <TextInput id="ef-url" type="url"
                value={card.demo?.[meta.urlKey] || ''}
                onChange={(_e, v) => setDemo(meta.urlKey, v)}
                validated={errs.url ? 'error' : 'default'}
                placeholder={meta.urlPlaceholder} />
              {type === 'arcade' && (
                <div style={{ fontSize: '0.8rem', color: '#6a6e73', marginTop: 4 }}>
                  From Arcade: Share → copy the interact.redhat.com link
                </div>
              )}
              {errs.url && errText(errs.url)}
            </FormGroup>
          )}

          {type === 'arcade' && (
            <FormGroup label="Aspect ratio override" fieldId="ef-aspect"
              helperText="Optional — defaults to 16:9 (56.25%)">
              <TextInput id="ef-aspect"
                value={card.demo?.aspect_ratio || ''}
                onChange={(_e, v) => setDemo('aspect_ratio', v)}
                placeholder="e.g. 56.25% or 4:3" />
            </FormGroup>
          )}

          {type === 'video-loop' && (
            <VideoLoopField demo={card.demo} error={errs.videos}
              onChange={d => setCard(p => ({ ...p, demo: d }))} />
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={handleSave}>Save</Button>
        <Button variant="link" onClick={onCancel}>Cancel</Button>
      </ModalFooter>
    </Modal>
  );
}

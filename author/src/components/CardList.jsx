import React, { useState, useRef } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Button, DataList, DataListItemRow, DataListItemCells,
  DataListCell, DataListAction, Switch, Label, Flex, FlexItem,
  Title, TextInput, TextArea, FormGroup, Form, Divider,
} from '@patternfly/react-core';
import {
  GripVerticalIcon, PencilAltIcon, TrashIcon, CheckIcon, TimesIcon,
} from '@patternfly/react-icons';
import { ACCEPT } from './MediaDropZone.jsx';
import UrlCardModal from './UrlCardModal.jsx';

// ── Card type definitions ─────────────────────────────────────────

const FILE_TYPES = [
  { type: 'video',      label: 'Video',     accept: '.mp4,.webm',                     hint: 'MP4, WebM' },
  { type: 'slides',     label: 'Slides',    accept: '.pdf',                           hint: 'PDF' },
  { type: 'asciinema',  label: 'Terminal',  accept: '.cast',                          hint: '.cast' },
  { type: 'image-text', label: 'Image',     accept: '.png,.jpg,.jpeg,.svg,.webp',     hint: 'PNG, JPG, SVG' },
];

const URL_TYPES = [
  { type: 'external-url', label: 'External URL' },
  { type: 'lab',          label: 'Lab' },
  { type: 'arcade',       label: 'Arcade Demo' },
  { type: 'video-loop',   label: 'Video Loop' },
];

const TYPE_LABELS = {
  video: 'Video', slides: 'Slides', asciinema: 'Terminal',
  'image-text': 'Image', 'external-url': 'URL', lab: 'Lab',
  arcade: 'Arcade', 'video-loop': 'Loop',
};
const TYPE_COLORS = {
  video: 'blue', slides: 'purple', asciinema: 'cyan',
  'image-text': 'green', 'external-url': 'orange', lab: 'gold',
  arcade: 'teal', 'video-loop': 'grey',
};

// ── Card factory ──────────────────────────────────────────────────

function slugify(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'card';
}

function fileToCard(file, type) {
  return {
    id: slugify(file.name),
    title: '',
    summary: '',
    enabled: true,
    demo: { type, _mediaFile: file, _videoFiles: [], caption: '' },
  };
}

function isIncomplete(card) {
  return !card.title?.trim() || !card.summary?.trim();
}

function getRowKey(card, index) {
  return card.id || `__idx_${index}`;
}

// ── Inline edit form ──────────────────────────────────────────────

function InlineForm({ card, onChange, onDone }) {
  const isImageText = card.demo?.type === 'image-text';
  const mediaFile = card.demo?._mediaFile;

  return (
    <div style={{
      padding: '0.875rem 1rem 1rem',
      background: 'var(--pf-t--color--gray--10, #f9f9f9)',
      borderTop: '1px solid #d2d2d2',
    }}>
      <Form isHorizontal>
        <FormGroup label="ID" fieldId="inline-id" isRequired>
          <TextInput id="inline-id"
            value={card.id}
            onChange={(_e, v) => onChange({
              ...card,
              id: v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+/, ''),
            })}
            placeholder="card-id"
            style={{ maxWidth: 220 }}
          />
        </FormGroup>
        <FormGroup label="Title" fieldId="inline-title" isRequired>
          <TextInput id="inline-title" autoFocus
            value={card.title}
            onChange={(_e, v) => onChange({ ...card, title: v })}
            placeholder="Card title shown on the kiosk"
          />
        </FormGroup>
        <FormGroup label="Summary" fieldId="inline-summary" isRequired>
          <TextArea id="inline-summary"
            value={card.summary}
            onChange={(_e, v) => onChange({ ...card, summary: v })}
            rows={2}
            placeholder="One sentence shown under the title."
          />
        </FormGroup>
        {isImageText && (
          <FormGroup label="Caption" fieldId="inline-caption" isRequired>
            <TextArea id="inline-caption"
              value={card.demo.caption || ''}
              onChange={(_e, v) => onChange({ ...card, demo: { ...card.demo, caption: v } })}
              rows={3}
              placeholder="Describe what is shown in the image."
            />
          </FormGroup>
        )}
        {mediaFile && (
          <FormGroup label="File" fieldId="inline-file">
            <Label color="green" isCompact>{mediaFile.name}</Label>
            <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#6a6e73' }}>
              ({(mediaFile.size / 1024 / 1024).toFixed(1)} MB)
            </span>
          </FormGroup>
        )}
      </Form>
      <Flex style={{ marginTop: '0.75rem' }}>
        <FlexItem>
          <Button variant="primary" size="sm" onClick={onDone}>
            <CheckIcon style={{ marginRight: 4 }} />Done
          </Button>
        </FlexItem>
        <FlexItem>
          <Button variant="plain" size="sm" onClick={onDone} aria-label="Close">
            <TimesIcon />
          </Button>
        </FlexItem>
      </Flex>
    </div>
  );
}

// ── Sortable card row ─────────────────────────────────────────────

function SortableRow({ card, index, isEditing, onToggleEdit, onCardChange, onDelete, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: getRowKey(card, index) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  const type = card.demo?.type;
  const incomplete = isIncomplete(card);

  return (
    <li ref={setNodeRef} style={style} className="pf-c-data-list__item" aria-labelledby={`card-${index}-title`}>
      <DataListItemRow>
        <DataListItemCells dataListCells={[
          <DataListCell key="drag" style={{ flex: '0 0 2rem' }}>
            {!isEditing && (
              <span {...attributes} {...listeners}
                style={{ cursor: 'grab', color: '#6a6e73', display: 'block', padding: '2px 0' }}>
                <GripVerticalIcon />
              </span>
            )}
          </DataListCell>,
          <DataListCell key="order" style={{ flex: '0 0 2.5rem', color: '#6a6e73', fontSize: '0.8rem' }}>
            {(index + 1) * 10}
          </DataListCell>,
          <DataListCell key="type" style={{ flex: '0 0 6rem' }}>
            <Label color={TYPE_COLORS[type] || 'grey'} isCompact>
              {TYPE_LABELS[type] || type}
            </Label>
          </DataListCell>,
          <DataListCell key="content" id={`card-${index}-title`}>
            <div onClick={() => onToggleEdit(index)} style={{ cursor: 'pointer' }}>
              {incomplete ? (
                <span style={{ color: '#795600', fontSize: '0.875rem' }}>
                  Needs title &amp; summary
                  {card.demo?._mediaFile && (
                    <span style={{ marginLeft: 8, color: '#6a6e73' }}>· {card.demo._mediaFile.name}</span>
                  )}
                </span>
              ) : (
                <>
                  <strong>{card.title}</strong>
                  <div style={{ fontSize: '0.8rem', color: '#6a6e73', marginTop: 2 }}>
                    {card.summary.length > 90 ? card.summary.slice(0, 90) + '…' : card.summary}
                  </div>
                  {card.demo?._mediaFile && (
                    <div style={{ fontSize: '0.75rem', color: '#6a6e73', marginTop: 2 }}>
                      {card.demo._mediaFile.name}
                    </div>
                  )}
                </>
              )}
            </div>
          </DataListCell>,
          <DataListCell key="enabled" style={{ flex: '0 0 5rem' }}>
            <Switch isChecked={card.enabled !== false}
              onChange={(_e, checked) => onToggle(index, checked)}
              aria-label="Enabled" isCompact />
          </DataListCell>,
        ]} />
        <DataListAction aria-label="actions" id={`card-${index}-actions`}
          aria-labelledby={`card-${index}-title`}>
          <Button variant="plain" aria-label="Edit" onClick={() => onToggleEdit(index)}
            style={{ color: isEditing ? 'var(--pf-t--color--blue--40, #2b9af3)' : undefined }}>
            <PencilAltIcon />
          </Button>
          <Button variant="plain" aria-label="Delete" onClick={() => onDelete(index)}
            style={{ color: 'var(--pf-t--color--red--50, #c9190b)' }}>
            <TrashIcon />
          </Button>
        </DataListAction>
      </DataListItemRow>

      {isEditing && (
        <InlineForm
          card={card}
          onChange={updated => onCardChange(index, updated)}
          onDone={() => onToggleEdit(index)}
        />
      )}
    </li>
  );
}

// ── Main CardList ─────────────────────────────────────────────────

export default function CardList({ cards, setCards }) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [urlModal, setUrlModal] = useState(null);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const fileInputRef = useRef(null);
  const bulkInputRef = useRef(null);
  const pendingType = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Infer type from extension for drag-dropped files
  const EXT_TO_TYPE = {
    mp4: 'video', webm: 'video', pdf: 'slides', cast: 'asciinema',
    png: 'image-text', jpg: 'image-text', jpeg: 'image-text',
    svg: 'image-text', webp: 'image-text',
  };

  function addDroppedFiles(files) {
    const newCards = [];
    const rejected = [];
    for (const f of files) {
      const ext = f.name.split('.').pop().toLowerCase();
      const type = EXT_TO_TYPE[ext];
      if (type) newCards.push(fileToCard(f, type));
      else rejected.push(f.name);
    }
    if (newCards.length) setCards(prev => [...prev, ...newCards]);
    if (rejected.length) alert(`Skipped (unsupported): ${rejected.join(', ')}`);
  }

  // ── Type button: file-based ───────────────────────────────────────
  function handleFileTypeClick(type, accept) {
    pendingType.current = type;
    fileInputRef.current.accept = accept;
    fileInputRef.current.multiple = true;
    fileInputRef.current.click();
  }

  function handleFileInput(e) {
    const type = pendingType.current;
    const newCards = [...e.target.files].map(f => fileToCard(f, type));
    if (newCards.length) setCards(prev => [...prev, ...newCards]);
    e.target.value = '';
    pendingType.current = null;
  }

  // ── DnD reorder ───────────────────────────────────────────────────
  function handleDndEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    setCards(prev => {
      const oldIdx = prev.findIndex((c, i) => getRowKey(c, i) === active.id);
      const newIdx = prev.findIndex((c, i) => getRowKey(c, i) === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
  }

  // ── Card ops ──────────────────────────────────────────────────────
  function toggleEdit(index) {
    setEditingIndex(prev => prev === index ? null : index);
  }

  function handleCardChange(index, updated) {
    setCards(prev => prev.map((c, i) => i === index ? updated : c));
  }

  function handleDelete(index) {
    if (!confirm(`Delete "${cards[index].title || 'this card'}"?`)) return;
    setCards(prev => prev.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  }

  function handleToggle(index, checked) {
    setCards(prev => prev.map((c, i) => i === index ? { ...c, enabled: checked } : c));
  }

  function handleUrlSave(card) {
    if (urlModal.editIndex != null) {
      setCards(prev => prev.map((c, i) => i === urlModal.editIndex ? card : c));
    } else {
      setCards(prev => [...prev, card]);
    }
    setUrlModal(null);
  }

  const incomplete = cards.filter(isIncomplete).length;
  const ids = cards.map((c, i) => getRowKey(c, i));

  return (
    <div>
      {/* ── Add a card ───────────────────────────────────────────── */}
      <Title headingLevel="h2" size="md" style={{ marginBottom: '0.75rem' }}>Add a card</Title>

      <Flex wrap="wrap" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
        {FILE_TYPES.map(({ type, label, accept }) => (
          <FlexItem key={type}>
            <Button variant="secondary"
              onClick={() => handleFileTypeClick(type, accept)}>
              + {label}
            </Button>
          </FlexItem>
        ))}
        {URL_TYPES.map(({ type, label }) => (
          <FlexItem key={type}>
            <Button variant="secondary"
              onClick={() => setUrlModal({ type })}>
              + {label}
            </Button>
          </FlexItem>
        ))}
      </Flex>
      <div
        onDragOver={e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); } }}
        onDragEnter={e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDropZoneActive(true); } }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropZoneActive(false); }}
        onDrop={e => {
          e.preventDefault();
          setDropZoneActive(false);
          const files = [...e.dataTransfer.files];
          if (files.length) addDroppedFiles(files);
        }}
        onClick={() => bulkInputRef.current.click()}
        style={{
          border: `2px dashed ${dropZoneActive ? 'var(--pf-t--color--blue--40, #2b9af3)' : '#d2d2d2'}`,
          borderRadius: 6,
          background: dropZoneActive ? 'rgba(0,102,204,0.06)' : '#fafafa',
          padding: '1rem 1.5rem',
          marginBottom: '1.5rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          transition: 'border-color 0.15s, background 0.15s',
        }}>
        <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>+</span>
        <span>
          <strong style={{ fontSize: '0.9rem' }}>Add files in bulk</strong>
          <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#6a6e73' }}>
            Drop files here or click to browse — MP4, WebM, PDF, .cast, PNG, JPG, SVG accepted. Card type is inferred from file extension.
          </span>
        </span>
      </div>

      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileInput} />
      <input ref={bulkInputRef} type="file" multiple accept=".mp4,.webm,.pdf,.cast,.png,.jpg,.jpeg,.svg,.webp" style={{ display: 'none' }}
        onChange={e => {
          const files = [...e.target.files];
          if (files.length) addDroppedFiles(files);
          e.target.value = '';
        }}
      />

      <Divider style={{ marginBottom: '1rem' }} />

      {/* ── Card list ─────────────────────────────────────────────── */}
      <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsCenter' }}
        style={{ marginBottom: '0.75rem' }}>
        <FlexItem>
          <Title headingLevel="h2" size="lg">
            Cards
            {cards.length > 0 && (
              <span style={{ fontWeight: 400, color: '#6a6e73', marginLeft: 8 }}>
                {cards.length}
                {incomplete > 0 && (
                  <span style={{ color: '#795600', marginLeft: 8 }}>
                    · {incomplete} need metadata
                  </span>
                )}
              </span>
            )}
          </Title>
        </FlexItem>
      </Flex>

      {cards.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: 120, color: '#6a6e73',
          border: '1px dashed #d2d2d2', borderRadius: 6,
        }}>
          No cards yet — use the buttons above to add your first card.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDndEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <DataList aria-label="Cards" isCompact>
              <li style={{ borderBottom: '2px solid #d2d2d2' }}>
                <DataListItemRow>
                  <DataListItemCells dataListCells={[
                    <DataListCell key="drag" style={{ flex: '0 0 2rem' }} />,
                    <DataListCell key="order" style={{ flex: '0 0 2.5rem', fontSize: '0.7rem', fontWeight: 700, color: '#6a6e73', textTransform: 'uppercase' }}>#</DataListCell>,
                    <DataListCell key="type" style={{ flex: '0 0 6rem', fontSize: '0.7rem', fontWeight: 700, color: '#6a6e73', textTransform: 'uppercase' }}>Type</DataListCell>,
                    <DataListCell key="content" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6a6e73', textTransform: 'uppercase' }}>Card</DataListCell>,
                    <DataListCell key="enabled" style={{ flex: '0 0 5rem', fontSize: '0.7rem', fontWeight: 700, color: '#6a6e73', textTransform: 'uppercase' }}>Enabled</DataListCell>,
                  ]} />
                  <DataListAction aria-label="actions header" id="col-header-actions" aria-labelledby="col-header-actions" style={{ position: 'relative' }}>
                    <Button variant="plain" tabIndex={-1} aria-hidden="true" style={{ visibility: 'hidden' }}><PencilAltIcon /></Button>
                    <Button variant="plain" tabIndex={-1} aria-hidden="true" style={{ visibility: 'hidden' }}><TrashIcon /></Button>
                    <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#6a6e73', textTransform: 'uppercase', pointerEvents: 'none' }}>Actions</span>
                  </DataListAction>
                </DataListItemRow>
              </li>
              {cards.map((card, index) => (
                <SortableRow
                  key={getRowKey(card, index)}
                  card={card}
                  index={index}
                  isEditing={editingIndex === index}
                  onToggleEdit={toggleEdit}
                  onCardChange={handleCardChange}
                  onDelete={handleDelete}
                  onToggle={handleToggle}
                />
              ))}
            </DataList>
          </SortableContext>
        </DndContext>
      )}

      {urlModal && (
        <UrlCardModal
          type={urlModal.type}
          card={urlModal.editIndex != null ? cards[urlModal.editIndex] : undefined}
          onSave={handleUrlSave}
          onCancel={() => setUrlModal(null)}
        />
      )}
    </div>
  );
}

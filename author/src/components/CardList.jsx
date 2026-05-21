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
  Title, Divider,
} from '@patternfly/react-core';
import {
  GripVerticalIcon, PencilAltIcon, TrashIcon, EyeIcon,
} from '@patternfly/react-icons';
import CardEditModal from './CardEditModal.jsx';
import CardPreview from './CardPreview.jsx';

// ── Card type definitions ─────────────────────────────────────────

const FILE_TYPES = [
  { type: 'video',      label: 'Video' },
  { type: 'slides',     label: 'Slides' },
  { type: 'asciinema',  label: 'Terminal' },
  { type: 'image-text', label: 'Image' },
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

// ── Card factories ────────────────────────────────────────────────

function slugify(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'card';
}

function newCard(type) {
  const base = { id: '', title: '', summary: '', enabled: true, _isNew: true };
  if (type === 'video' || type === 'slides' || type === 'asciinema') {
    base.demo = { type, _mediaFile: null };
  } else if (type === 'image-text') {
    base.demo = { type, _mediaFile: null, caption: '' };
  } else if (type === 'external-url') {
    base.demo = { type, url: 'https://', long_description: '' };
  } else if (type === 'lab') {
    base.demo = { type, url: 'https://', long_description: '', duration: '' };
  } else if (type === 'arcade') {
    base.demo = { type, share_url: 'https://', aspect_ratio: '' };
  } else if (type === 'video-loop') {
    base.demo = { type, _videoFiles: [] };
  }
  return base;
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
  if (!card.title?.trim()) return true;
  if (card.demo?.type !== 'video-loop' && !card.summary?.trim()) return true;
  return false;
}

function getRowKey(card, index) {
  return card.id || `__idx_${index}`;
}

// ── Sortable card row ─────────────────────────────────────────────

function SortableRow({ card, index, onEdit, onDelete, onToggle, onPreview }) {
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
            <span {...attributes} {...listeners}
              style={{ cursor: 'grab', color: '#6a6e73', display: 'block', padding: '2px 0' }}>
              <GripVerticalIcon />
            </span>
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
            <div onClick={() => onEdit(index)} style={{ cursor: 'pointer' }}>
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
                  {card.demo?._mediaFile ? (
                    <div style={{ fontSize: '0.75rem', color: '#6a6e73', marginTop: 2 }}>
                      {card.demo._mediaFile.name}
                    </div>
                  ) : card.demo?.src ? (
                    <div style={{ fontSize: '0.75rem', color: '#999', marginTop: 2, fontStyle: 'italic' }}>
                      {card.demo.src.split('/').pop()} (path ref — not embedded)
                    </div>
                  ) : null}
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
          <Button variant="plain" aria-label="Preview" onClick={() => onPreview(index)}>
            <EyeIcon />
          </Button>
          <Button variant="plain" aria-label="Edit" onClick={() => onEdit(index)}>
            <PencilAltIcon />
          </Button>
          <Button variant="plain" aria-label="Delete" onClick={() => onDelete(index)}
            style={{ color: 'var(--pf-t--color--red--50, #c9190b)' }}>
            <TrashIcon />
          </Button>
        </DataListAction>
      </DataListItemRow>
    </li>
  );
}

// ── Main CardList ─────────────────────────────────────────────────

export default function CardList({ cards, setCards }) {
  const [editModal, setEditModal] = useState(null);
  const [previewCard, setPreviewCard] = useState(null);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const bulkInputRef = useRef(null);

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

  function handleEdit(index) {
    setEditModal({ card: cards[index], editIndex: index });
  }

  function handleCardSave(card) {
    if (editModal.editIndex != null) {
      setCards(prev => prev.map((c, i) => i === editModal.editIndex ? card : c));
    } else {
      setCards(prev => [...prev, card]);
    }
    setEditModal(null);
  }

  function handleDelete(index) {
    if (!confirm(`Delete "${cards[index].title || 'this card'}"?`)) return;
    setCards(prev => prev.filter((_, i) => i !== index));
  }

  function handleToggle(index, checked) {
    setCards(prev => prev.map((c, i) => i === index ? { ...c, enabled: checked } : c));
  }

  const incomplete = cards.filter(isIncomplete).length;
  const ids = cards.map((c, i) => getRowKey(c, i));

  return (
    <div>
      {/* ── Add a card ───────────────────────────────────────────── */}
      <Title headingLevel="h2" size="md" style={{ marginBottom: '0.75rem' }}>Add a card</Title>

      <Flex wrap="wrap" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
        {FILE_TYPES.map(({ type, label }) => (
          <FlexItem key={type}>
            <Button variant="secondary" onClick={() => setEditModal({ card: newCard(type) })}>
              + {label}
            </Button>
          </FlexItem>
        ))}
        {URL_TYPES.map(({ type, label }) => (
          <FlexItem key={type}>
            <Button variant="secondary" onClick={() => setEditModal({ card: newCard(type) })}>
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
                    <Button variant="plain" tabIndex={-1} aria-hidden="true" style={{ visibility: 'hidden' }}><EyeIcon /></Button>
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
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onToggle={handleToggle}
                  onPreview={index => setPreviewCard(cards[index])}
                />
              ))}
            </DataList>
          </SortableContext>
        </DndContext>
      )}

      {editModal && (
        <CardEditModal
          card={editModal.card}
          onSave={handleCardSave}
          onCancel={() => setEditModal(null)}
        />
      )}

      {previewCard && (
        <CardPreview card={previewCard} onClose={() => setPreviewCard(null)} />
      )}
    </div>
  );
}

import React, { useState, useRef, useCallback } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Button, DataList, DataListItem, DataListItemRow, DataListItemCells,
  DataListCell, DataListAction, Switch, Label, Flex, FlexItem,
  Title, TextInput, TextArea, FormGroup, Form,
} from '@patternfly/react-core';
import {
  GripVerticalIcon, PencilAltIcon, TrashIcon, CheckIcon, TimesIcon,
  UploadIcon,
} from '@patternfly/react-icons';
import { processFiles, ACCEPT } from './MediaDropZone.jsx';
import UrlCardModal from './UrlCardModal.jsx';

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
const URL_TYPES = [
  { type: 'external-url', label: '+ URL' },
  { type: 'lab',          label: '+ Lab' },
  { type: 'arcade',       label: '+ Arcade' },
  { type: 'video-loop',   label: '+ Video Loop' },
];

function getRowKey(card, index) {
  return card.id || `__idx_${index}`;
}

function isIncomplete(card) {
  return !card.title?.trim() || !card.summary?.trim();
}

// ── Inline edit form ─────────────────────────────────────────────

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
            onChange={(_e, v) => onChange({ ...card, id: v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+/, '') })}
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
    <DataListItem ref={setNodeRef} style={style} aria-labelledby={`card-${index}-title`}>
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
            {incomplete ? (
              <span style={{ color: '#795600', fontSize: '0.875rem' }}>
                Needs title &amp; summary
                {card.demo?._mediaFile && (
                  <span style={{ marginLeft: 8, color: '#6a6e73' }}>
                    · {card.demo._mediaFile.name}
                  </span>
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
    </DataListItem>
  );
}

// ── Main CardList ─────────────────────────────────────────────────

export default function CardList({ cards, setCards }) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [urlModal, setUrlModal] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [rejected, setRejected] = useState([]);
  const fileInputRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addFiles = useCallback((files) => {
    const { cards: newCards, rejected: bad } = processFiles(files);
    if (newCards.length) setCards(prev => [...prev, ...newCards]);
    if (bad.length) {
      setRejected(bad);
      setTimeout(() => setRejected([]), 5000);
    }
  }, [setCards]);

  function handleDragOver(e) { e.preventDefault(); setDragOver(true); }
  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
  }
  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    addFiles([...e.dataTransfer.files]);
  }

  function handleFileInput(e) {
    addFiles([...e.target.files]);
    e.target.value = '';
  }

  function handleDndEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    setCards(prev => {
      const oldIdx = prev.findIndex((c, i) => getRowKey(c, i) === active.id);
      const newIdx = prev.findIndex((c, i) => getRowKey(c, i) === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
  }

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
      {/* ── Toolbar ────────────────────────────────────────────── */}
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsCenter' }}
        style={{ marginBottom: '1rem' }}
        wrap="wrap"
      >
        <FlexItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem>
              <Title headingLevel="h2" size="lg" style={{ marginRight: '0.5rem' }}>
                Cards
                {cards.length > 0 && (
                  <span style={{ fontWeight: 400, color: '#6a6e73', marginLeft: 6 }}>
                    {cards.length}
                    {incomplete > 0 && (
                      <span style={{ color: '#795600', marginLeft: 6 }}>
                        · {incomplete} incomplete
                      </span>
                    )}
                  </span>
                )}
              </Title>
            </FlexItem>
          </Flex>
        </FlexItem>

        <FlexItem>
          <Flex wrap="wrap">
            <FlexItem>
              <Button variant="secondary" onClick={() => fileInputRef.current.click()}>
                <UploadIcon style={{ marginRight: 6 }} />
                Add Files
              </Button>
              <input ref={fileInputRef} type="file" accept={ACCEPT} multiple
                style={{ display: 'none' }} onChange={handleFileInput} />
            </FlexItem>
            {URL_TYPES.map(({ type, label }) => (
              <FlexItem key={type}>
                <Button variant="plain" onClick={() => setUrlModal({ type })}
                  style={{ color: 'var(--pf-t--color--blue--40, #2b9af3)', fontWeight: 500 }}>
                  {label}
                </Button>
              </FlexItem>
            ))}
          </Flex>
        </FlexItem>
      </Flex>

      {rejected.length > 0 && (
        <div style={{ marginBottom: 8, fontSize: '0.8rem', color: '#c9190b' }}>
          Skipped (unsupported): {rejected.join(', ')}
        </div>
      )}

      {/* ── Drop target + card list ───────────────────────────── */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          borderRadius: 6,
          outline: dragOver ? '2px dashed var(--pf-t--color--blue--40, #2b9af3)' : '2px dashed transparent',
          background: dragOver ? 'var(--pf-t--color--blue--10, #e7f1fa)' : 'transparent',
          transition: 'outline 0.1s, background 0.1s',
          minHeight: 120,
        }}
      >
        {cards.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: 160, color: '#6a6e73',
            border: '1px dashed #d2d2d2', borderRadius: 6,
          }}>
            <UploadIcon style={{ fontSize: '1.5rem', marginBottom: 8 }} />
            <div>Use <strong>Add Files</strong> above, or drag files here</div>
            <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
              Video · Slides · Terminal · Image — one file or many
            </div>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDndEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <DataList aria-label="Cards" isCompact>
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

        {dragOver && cards.length > 0 && (
          <div style={{ textAlign: 'center', padding: '0.75rem', color: 'var(--pf-t--color--blue--40, #2b9af3)', fontSize: '0.875rem' }}>
            Drop to add files
          </div>
        )}
      </div>

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

import React, { useState } from 'react';
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
  DataListCell, DataListAction, Switch, Label, Flex, FlexItem, Title,
  EmptyState, EmptyStateBody,
} from '@patternfly/react-core';
import { GripVerticalIcon, PencilAltIcon, TrashIcon } from '@patternfly/react-icons';
import CardEditor from './CardEditor.jsx';

const TYPE_LABELS = {
  video: 'Video',
  slides: 'Slides',
  asciinema: 'Terminal',
  'image-text': 'Image',
  'external-url': 'URL',
  lab: 'Lab',
  arcade: 'Arcade',
  'video-loop': 'Loop',
};

function SortableRow({ card, index, onEdit, onDelete, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id || String(index) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? 'var(--pf-v5-global--BackgroundColor--200, #f0f0f0)' : undefined,
  };

  const typeLabel = TYPE_LABELS[card.demo?.type] || card.demo?.type || '—';
  const mediaName = getMediaName(card);

  return (
    <DataListItem ref={setNodeRef} style={style} aria-labelledby={`card-${index}-title`}>
      <DataListItemRow>
        <DataListItemCells
          dataListCells={[
            <DataListCell key="drag" style={{ flex: '0 0 2rem' }}>
              <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#6a6e73' }}>
                <GripVerticalIcon />
              </span>
            </DataListCell>,
            <DataListCell key="order" style={{ flex: '0 0 3rem', color: '#6a6e73' }}>
              {(index + 1) * 10}
            </DataListCell>,
            <DataListCell key="type" style={{ flex: '0 0 6rem' }}>
              <Label color="blue" isCompact>{typeLabel}</Label>
            </DataListCell>,
            <DataListCell key="title" id={`card-${index}-title`}>
              <strong>{card.title || <em style={{ color: '#6a6e73' }}>Untitled</em>}</strong>
              {mediaName && (
                <div style={{ fontSize: '0.8rem', color: '#6a6e73', marginTop: 2 }}>{mediaName}</div>
              )}
            </DataListCell>,
            <DataListCell key="enabled" style={{ flex: '0 0 5rem' }}>
              <Switch
                isChecked={card.enabled !== false}
                onChange={(_e, checked) => onToggle(index, checked)}
                aria-label="Enabled"
                isCompact
              />
            </DataListCell>,
          ]}
        />
        <DataListAction aria-label="card actions" id={`card-${index}-actions`} aria-labelledby={`card-${index}-title`}>
          <Flex>
            <FlexItem>
              <Button variant="plain" aria-label="Edit card" onClick={() => onEdit(index)}>
                <PencilAltIcon />
              </Button>
            </FlexItem>
            <FlexItem>
              <Button variant="plain" aria-label="Delete card" onClick={() => onDelete(index)}
                style={{ color: 'var(--pf-v5-global--danger-color--100, #c9190b)' }}>
                <TrashIcon />
              </Button>
            </FlexItem>
          </Flex>
        </DataListAction>
      </DataListItemRow>
    </DataListItem>
  );
}

function getMediaName(card) {
  const { demo } = card;
  if (!demo) return null;
  if (demo._mediaFile) return demo._mediaFile.name;
  if (demo._videoFiles?.length) return `${demo._videoFiles.length} video(s)`;
  return null;
}

export default function CardList({ cards, setCards, emptyCard }) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingCard, setEditingCard] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCards(prev => {
      const oldIndex = prev.findIndex(c => (c.id || String(prev.indexOf(c))) === active.id);
      const newIndex = prev.findIndex(c => (c.id || String(prev.indexOf(c))) === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function handleAdd() {
    setEditingIndex(-1);
    setEditingCard(emptyCard());
  }

  function handleEdit(index) {
    setEditingIndex(index);
    setEditingCard(structuredClone ? structuredClone(cards[index]) : JSON.parse(JSON.stringify(cards[index])));
  }

  function handleDelete(index) {
    if (!confirm(`Delete "${cards[index].title || 'this card'}"?`)) return;
    setCards(prev => prev.filter((_, i) => i !== index));
  }

  function handleToggle(index, checked) {
    setCards(prev => prev.map((c, i) => i === index ? { ...c, enabled: checked } : c));
  }

  function handleSave(savedCard) {
    if (editingIndex === -1) {
      setCards(prev => [...prev, savedCard]);
    } else {
      setCards(prev => prev.map((c, i) => i === editingIndex ? savedCard : c));
    }
    setEditingIndex(null);
    setEditingCard(null);
  }

  function handleCancelEdit() {
    setEditingIndex(null);
    setEditingCard(null);
  }

  const ids = cards.map((c, i) => c.id || String(i));

  return (
    <>
      <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} style={{ marginBottom: '1rem' }}>
        <FlexItem>
          <Title headingLevel="h2" size="lg">Cards</Title>
        </FlexItem>
        <FlexItem>
          <Button variant="primary" onClick={handleAdd}>Add Card</Button>
        </FlexItem>
      </Flex>

      {cards.length === 0 ? (
        <EmptyState>
          <EmptyStateBody>No cards yet. Click "Add Card" to create one.</EmptyStateBody>
        </EmptyState>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <DataList aria-label="Cards" isCompact>
              {cards.map((card, index) => (
                <SortableRow
                  key={card.id || index}
                  card={card}
                  index={index}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onToggle={handleToggle}
                />
              ))}
            </DataList>
          </SortableContext>
        </DndContext>
      )}

      {editingCard !== null && (
        <CardEditor
          card={editingCard}
          isNew={editingIndex === -1}
          onSave={handleSave}
          onCancel={handleCancelEdit}
        />
      )}
    </>
  );
}

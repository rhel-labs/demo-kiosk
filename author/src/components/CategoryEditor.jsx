import React, { useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Checkbox, Title } from '@patternfly/react-core';
import { GripVerticalIcon, TrashIcon } from '@patternfly/react-icons';

// ── Sortable category row ─────────────────────────────────────────

function SortableCategoryRow({ category, cards, onDelete, onToggleCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        border: '1px solid #d2d2d2',
        borderRadius: 6,
        background: '#fff',
        padding: '0.75rem 1rem',
        marginBottom: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: 'grab', color: '#6a6e73', flexShrink: 0 }}
          aria-label="Drag to reorder"
        >
          <GripVerticalIcon />
        </span>
        <strong style={{ flex: 1 }}>{category.name}</strong>
        <Button variant="plain" aria-label={`Delete category ${category.name}`} onClick={onDelete}>
          <TrashIcon />
        </Button>
      </div>

      {cards.length > 0 && (
        <div style={{ marginTop: 8, paddingLeft: 24 }}>
          {cards.map(card => (
            <Checkbox
              key={card.id}
              id={`cat-${category.name}-${card.id}`}
              label={card.title || card.id}
              isChecked={category.cards.includes(card.id)}
              onChange={(_e, checked) => onToggleCard(card.id, checked)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── CategoryEditor ────────────────────────────────────────────────

export default function CategoryEditor({ cards, categories, setCategories }) {
  const [newName, setNewName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (categories.some(c => c.name === trimmed)) return;
    setCategories(prev => [...prev, { name: trimmed, cards: [] }]);
    setNewName('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleAdd();
  }

  function handleDndEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    setCategories(prev => {
      const oldIdx = prev.findIndex(c => c.name === active.id);
      const newIdx = prev.findIndex(c => c.name === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
  }

  function handleDelete(categoryName) {
    setCategories(prev => prev.filter(c => c.name !== categoryName));
  }

  function handleToggleCard(categoryName, cardId, checked) {
    setCategories(prev => prev.map(c =>
      c.name !== categoryName ? c :
      { ...c, cards: checked ? [...c.cards, cardId] : c.cards.filter(id => id !== cardId) }
    ));
  }

  const ids = categories.map(c => c.name);

  return (
    <div style={{ maxWidth: 720 }}>
      <Title headingLevel="h2" size="lg" style={{ marginBottom: '1rem' }}>Categories</Title>

      {/* Add category row */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            id="new-category-input"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="New category name"
            style={{
              width: 320, padding: '6px 12px',
              border: '1px solid #d2d2d2', borderRadius: 4,
              fontSize: '1rem', lineHeight: 1.5,
            }}
          />
          <Button
            variant="primary"
            onClick={handleAdd}
            isDisabled={
              !newName.trim() || categories.some(c => c.name === newName.trim())
            }
          >
            Add
          </Button>
        </div>
        {newName.trim() && categories.some(c => c.name === newName.trim()) && (
          <div style={{ marginTop: 4, fontSize: '0.85rem', color: '#c9190b' }}>
            A category with that name already exists.
          </div>
        )}
      </div>

      {/* Empty state */}
      {categories.length === 0 && (
        <div style={{
          color: '#6a6e73',
          border: '1px dashed #d2d2d2',
          borderRadius: 6,
          padding: '1.5rem',
          textAlign: 'center',
        }}>
          No categories yet — add one above.
        </div>
      )}

      {/* No-cards hint */}
      {categories.length > 0 && cards.length === 0 && (
        <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: '#6a6e73' }}>
          Add cards in the Cards tab to assign them here.
        </div>
      )}

      {/* Sortable list */}
      {categories.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDndEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {categories.map(category => (
              <SortableCategoryRow
                key={category.name}
                category={category}
                cards={cards}
                onDelete={() => handleDelete(category.name)}
                onToggleCard={(cardId, checked) => handleToggleCard(category.name, cardId, checked)}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

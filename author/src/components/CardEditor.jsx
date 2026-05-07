import React, { useState } from 'react';
import {
  Modal, ModalHeader, ModalBody, ModalFooter,
  Form, FormGroup, TextInput, TextArea,
  Switch, Select, SelectList, SelectOption, MenuToggle, Button,
} from '@patternfly/react-core';
import CardTypeFields from './CardTypeFields.jsx';

const DEMO_TYPES = [
  { value: 'video',        label: 'Video (MP4/WebM)' },
  { value: 'slides',       label: 'Slides (PDF)' },
  { value: 'asciinema',    label: 'Terminal recording (.cast)' },
  { value: 'image-text',   label: 'Image + caption' },
  { value: 'external-url', label: 'External URL' },
  { value: 'lab',          label: 'Hands-on lab (RHDP)' },
  { value: 'arcade',       label: 'Arcade interactive demo' },
  { value: 'video-loop',   label: 'Video loop (ambient reel)' },
];

function resetDemo(type) {
  const base = { type, _mediaFile: null, _videoFiles: [] };
  if (type === 'external-url' || type === 'lab') { base.url = ''; base.long_description = ''; }
  if (type === 'arcade') base.share_url = '';
  if (type === 'image-text') base.caption = '';
  return base;
}

export default function CardEditor({ card, isNew, onSave, onCancel }) {
  const [local, setLocal] = useState(card);
  const [typeOpen, setTypeOpen] = useState(false);

  function field(key, value) {
    setLocal(prev => ({ ...prev, [key]: value }));
  }

  function handleTypeSelect(_e, value) {
    setLocal(prev => ({ ...prev, demo: resetDemo(value) }));
    setTypeOpen(false);
  }

  const selectedTypeLabel = DEMO_TYPES.find(t => t.value === local.demo?.type)?.label || 'Select type';

  return (
    <Modal variant="medium" isOpen onClose={onCancel}>
      <ModalHeader title={isNew ? 'Add Card' : `Edit: ${card.title || 'Card'}`} />
      <ModalBody>
        <Form>
          <FormGroup label="Card ID" isRequired
            helperText="Unique identifier — lowercase letters, numbers, hyphens (e.g. my-topic)">
            <TextInput
              value={local.id}
              onChange={(_e, v) => field('id', v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+/, ''))}
              placeholder="my-topic"
            />
          </FormGroup>

          <FormGroup label="Title" isRequired>
            <TextInput
              value={local.title}
              onChange={(_e, v) => field('title', v)}
              placeholder="What is your question?"
            />
          </FormGroup>

          <FormGroup label="Summary" isRequired helperText="One sentence shown under the title on the card">
            <TextArea
              value={local.summary}
              onChange={(_e, v) => field('summary', v)}
              rows={2}
              placeholder="A brief description of what this answer covers."
            />
          </FormGroup>

          <FormGroup label="Visibility">
            <Switch
              label="Visible on kiosk"
              isChecked={local.enabled !== false}
              onChange={(_e, checked) => field('enabled', checked)}
            />
          </FormGroup>

          <FormGroup label="Demo type" isRequired>
            <Select
              isOpen={typeOpen}
              onOpenChange={setTypeOpen}
              selected={local.demo?.type}
              onSelect={handleTypeSelect}
              toggle={ref => (
                <MenuToggle ref={ref} onClick={() => setTypeOpen(!typeOpen)} isExpanded={typeOpen}>
                  {selectedTypeLabel}
                </MenuToggle>
              )}
            >
              <SelectList>
                {DEMO_TYPES.map(t => (
                  <SelectOption key={t.value} value={t.value}>{t.label}</SelectOption>
                ))}
              </SelectList>
            </Select>
          </FormGroup>

          {local.demo?.type && (
            <CardTypeFields
              demo={local.demo}
              onChange={demo => setLocal(prev => ({ ...prev, demo }))}
            />
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button key="save" variant="primary" onClick={() => onSave(local)}>Save</Button>
        <Button key="cancel" variant="link" onClick={onCancel}>Cancel</Button>
      </ModalFooter>
    </Modal>
  );
}

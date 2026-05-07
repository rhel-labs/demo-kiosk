import React, { useRef } from 'react';
import {
  Form, FormGroup, TextInput, Title,
  Button, Flex, FlexItem, Label,
  Divider,
} from '@patternfly/react-core';
import { TrashIcon } from '@patternfly/react-icons';

function LogoField({ label, logoState, onChange }) {
  const inputRef = useRef(null);
  const { _file, _existingPath } = logoState;
  const displayName = _file ? _file.name : (_existingPath ? _existingPath.split('/').pop() : null);

  return (
    <div style={{ marginBottom: '1rem' }}>
      <strong style={{ display: 'block', marginBottom: 4 }}>{label}</strong>
      <div style={{ marginBottom: 8 }}>
        {displayName ? (
          <Flex alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem>
              <Label color={_file ? 'green' : 'grey'} isCompact>{displayName}</Label>
            </FlexItem>
            <FlexItem>
              <Button variant="plain" onClick={() => onChange({ ...logoState, _file: null, _existingPath: null })} aria-label="Remove logo">
                <TrashIcon />
              </Button>
            </FlexItem>
            <FlexItem>
              <Button variant="link" isInline onClick={() => inputRef.current.click()}>Replace</Button>
            </FlexItem>
          </Flex>
        ) : (
          <Button variant="secondary" onClick={() => inputRef.current.click()}>
            Upload logo (SVG or PNG)
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".svg,.png"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files[0];
            if (f) onChange({ ...logoState, _file: f, _existingPath: null });
            e.target.value = '';
          }}
        />
      </div>
      <FormGroup label="Alt text" isRequired>
        <TextInput
          value={logoState.altText || ''}
          onChange={(_e, v) => onChange({ ...logoState, altText: v })}
          placeholder="Descriptive text for screen readers"
        />
      </FormGroup>
    </div>
  );
}

export default function BrandingEditor({ branding, setBranding }) {
  function setEvent(key, value) {
    setBranding(prev => ({ ...prev, event: { ...prev.event, [key]: value } }));
  }

  function setLogo(role, value) {
    setBranding(prev => ({
      ...prev,
      logos: { ...prev.logos, [role]: value },
    }));
  }

  return (
    <Form style={{ maxWidth: 640 }}>
      <Title headingLevel="h2" size="lg" style={{ marginBottom: '0.5rem' }}>Event Branding</Title>
      <p style={{ color: '#6a6e73', marginBottom: '1.5rem' }}>
        These fields appear in the kiosk header. Colors, layout, and footer use Red Hat defaults and can be adjusted via the <code>/manage</code> panel on a running kiosk.
      </p>

      <FormGroup label="Event header" isRequired helperText="Main text displayed in the kiosk masthead">
        <TextInput
          value={branding.event.header}
          onChange={(_e, v) => setEvent('header', v)}
          placeholder="Red Hat Summit"
        />
      </FormGroup>

      <FormGroup label="Tagline" helperText="Optional subtitle below the header">
        <TextInput
          value={branding.event.tagline || ''}
          onChange={(_e, v) => setEvent('tagline', v)}
          placeholder="Navigate what's now. Unlock what's next."
        />
      </FormGroup>

      <FormGroup label="Browser tab title" helperText="Optional — defaults to the header if left blank">
        <TextInput
          value={branding.event.title || ''}
          onChange={(_e, v) => setEvent('title', v)}
          placeholder="Red Hat Summit 2026 — Demo Kiosk"
        />
      </FormGroup>

      <Divider style={{ margin: '1rem 0' }} />

      <Title headingLevel="h3" size="md" style={{ marginBottom: '1rem' }}>Logos</Title>

      <LogoField
        label="Primary logo (left — typically Red Hat corporate logo)"
        logoState={branding.logos.primary}
        onChange={v => setLogo('primary', v)}
      />

      <LogoField
        label="Secondary logo (right — event-specific)"
        logoState={branding.logos.secondary}
        onChange={v => setLogo('secondary', v)}
      />

      <FormGroup label="Secondary logo link URL" helperText="Optional — opens when visitor clicks the event logo">
        <TextInput
          type="url"
          value={branding.logos.secondary.url || ''}
          onChange={(_e, v) => setLogo('secondary', { ...branding.logos.secondary, url: v })}
          placeholder="https://www.redhat.com/en/summit"
        />
      </FormGroup>
    </Form>
  );
}

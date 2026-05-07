import React, { useRef } from 'react';
import {
  FormGroup, TextInput, TextArea,
  Button, Flex, FlexItem, Label,
} from '@patternfly/react-core';
import { TrashIcon } from '@patternfly/react-icons';

function FileField({ label, accept, file, onChange, helpText }) {
  const inputRef = useRef(null);
  return (
    <FormGroup label={label} isRequired>
      {file ? (
        <Flex alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <Label color="green" isCompact>{file.name}</Label>
            <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#6a6e73' }}>
              ({(file.size / 1024 / 1024).toFixed(1)} MB)
            </span>
          </FlexItem>
          <FlexItem>
            <Button variant="plain" onClick={() => onChange(null)} aria-label="Remove file">
              <TrashIcon />
            </Button>
          </FlexItem>
          <FlexItem>
            <Button variant="link" isInline onClick={() => inputRef.current.click()}>
              Replace
            </Button>
          </FlexItem>
        </Flex>
      ) : (
        <Button variant="secondary" onClick={() => inputRef.current.click()}>
          Choose file
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files[0]; if (f) onChange(f); e.target.value = ''; }}
      />
      {helpText && <div style={{ fontSize: '0.8rem', color: '#6a6e73', marginTop: 4 }}>{helpText}</div>}
    </FormGroup>
  );
}

function VideoLoopFields({ demo, onChange }) {
  const inputRef = useRef(null);
  const files = demo._videoFiles || [];
  return (
    <FormGroup label="Video files" isRequired>
      <div style={{ marginBottom: 8 }}>
        {files.length === 0 && (
          <span style={{ color: '#6a6e73', fontSize: '0.875rem' }}>No videos added yet</span>
        )}
        {files.map((f, i) => (
          <Flex key={i} alignItems={{ default: 'alignItemsCenter' }} style={{ marginBottom: 4 }}>
            <FlexItem><Label color="blue" isCompact>{f.name}</Label></FlexItem>
            <FlexItem>
              <Button
                variant="plain"
                aria-label="Remove video"
                onClick={() => onChange({ ...demo, _videoFiles: files.filter((_, j) => j !== i) })}
              >
                <TrashIcon />
              </Button>
            </FlexItem>
          </Flex>
        ))}
      </div>
      <Button variant="secondary" onClick={() => inputRef.current.click()}>
        Add video
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".mp4,.webm"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files[0];
          if (f) onChange({ ...demo, _videoFiles: [...files, f] });
          e.target.value = '';
        }}
      />
      <div style={{ fontSize: '0.8rem', color: '#6a6e73', marginTop: 4 }}>
        Videos play sequentially in a loop. Drag rows in the card list to control playback order.
      </div>
    </FormGroup>
  );
}

export default function CardTypeFields({ demo, onChange }) {
  const { type } = demo;

  function field(key, value) {
    onChange({ ...demo, [key]: value });
  }

  if (type === 'video') {
    return (
      <FileField
        label="Video file"
        accept=".mp4,.webm"
        file={demo._mediaFile}
        onChange={f => onChange({ ...demo, _mediaFile: f })}
        helpText="MP4 or WebM"
      />
    );
  }

  if (type === 'slides') {
    return (
      <FileField
        label="PDF file"
        accept=".pdf"
        file={demo._mediaFile}
        onChange={f => onChange({ ...demo, _mediaFile: f })}
        helpText="Export from Google Slides as PDF"
      />
    );
  }

  if (type === 'asciinema') {
    return (
      <FileField
        label="Terminal recording"
        accept=".cast"
        file={demo._mediaFile}
        onChange={f => onChange({ ...demo, _mediaFile: f })}
        helpText=".cast file from asciinema rec"
      />
    );
  }

  if (type === 'image-text') {
    return (
      <>
        <FileField
          label="Image file"
          accept=".png,.jpg,.jpeg,.svg,.webp"
          file={demo._mediaFile}
          onChange={f => onChange({ ...demo, _mediaFile: f })}
          helpText="PNG, JPG, SVG, or WebP"
        />
        <FormGroup label="Caption" isRequired>
          <TextArea
            value={demo.caption || ''}
            onChange={(_e, v) => field('caption', v)}
            rows={4}
            placeholder="Describe what is shown in the image"
          />
        </FormGroup>
      </>
    );
  }

  if (type === 'external-url') {
    return (
      <>
        <FormGroup label="URL" isRequired>
          <TextInput
            type="url"
            value={demo.url || ''}
            onChange={(_e, v) => field('url', v)}
            placeholder="https://example.com"
          />
        </FormGroup>
        <FormGroup label="Description" isRequired>
          <TextArea
            value={demo.long_description || ''}
            onChange={(_e, v) => field('long_description', v)}
            rows={5}
            placeholder="Describe what visitors will find at this link. Supports **bold**, [links](url), and - bullet lists."
          />
        </FormGroup>
      </>
    );
  }

  if (type === 'lab') {
    return (
      <>
        <FormGroup label="Lab URL" isRequired>
          <TextInput
            type="url"
            value={demo.url || ''}
            onChange={(_e, v) => field('url', v)}
            placeholder="https://zero.rhdp.net/lab/your-lab-slug.prod"
          />
        </FormGroup>
        <FormGroup label="Description" isRequired>
          <TextArea
            value={demo.long_description || ''}
            onChange={(_e, v) => field('long_description', v)}
            rows={5}
            placeholder="Describe what visitors will do in this lab."
          />
        </FormGroup>
        <FormGroup label="Estimated duration (optional)">
          <TextInput
            value={demo.duration || ''}
            onChange={(_e, v) => field('duration', v)}
            placeholder="e.g. 30 minutes"
          />
        </FormGroup>
      </>
    );
  }

  if (type === 'arcade') {
    return (
      <>
        <FormGroup label="Share URL" isRequired>
          <TextInput
            value={demo.share_url || ''}
            onChange={(_e, v) => field('share_url', v)}
            placeholder="https://interact.redhat.com/share/YOUR_FLOW_ID"
          />
          <div style={{ fontSize: '0.8rem', color: '#6a6e73', marginTop: 4 }}>
            From Arcade: Share → copy the interact.redhat.com link
          </div>
        </FormGroup>
        <FormGroup label="Title override (optional)">
          <TextInput
            value={demo.title || ''}
            onChange={(_e, v) => field('title', v)}
            placeholder="Auto-fetched from Arcade if left blank"
          />
        </FormGroup>
        <FormGroup label="Aspect ratio override (optional)">
          <TextInput
            value={demo.aspect_ratio || ''}
            onChange={(_e, v) => field('aspect_ratio', v)}
            placeholder="e.g. 56.25% (auto-fetched if blank)"
          />
        </FormGroup>
      </>
    );
  }

  if (type === 'video-loop') {
    return <VideoLoopFields demo={demo} onChange={onChange} />;
  }

  return null;
}

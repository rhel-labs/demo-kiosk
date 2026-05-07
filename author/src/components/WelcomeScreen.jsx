import React, { useRef, useState } from 'react';
import {
  Grid, GridItem, Card, CardBody, CardTitle,
  Title, Content, Button, Spinner,
  EmptyState, EmptyStateBody,
} from '@patternfly/react-core';
import { importZip, defaultBranding } from '../utils/zipHandler.js';

export default function WelcomeScreen({ onStart }) {
  const zipInputRef = useRef(null);
  const [loading, setLoading] = useState(false);

  function handleNewBundle() {
    onStart([], defaultBranding());
  }

  async function handleZipFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const { cards, branding } = await importZip(file);
      onStart(cards, branding);
    } catch (err) {
      alert(`Could not load bundle: ${err.message}`);
      setLoading(false);
    } finally {
      e.target.value = '';
    }
  }

  return (
    <EmptyState>
      <Title headingLevel="h2" size="xl">Welcome to the Kiosk Authoring Tool</Title>
      <EmptyStateBody>
        <Content component="p" style={{ marginBottom: '2rem' }}>
          Create a content bundle that event staff can upload directly to a running kiosk.
        </Content>
        <Grid hasGutter span={12} style={{ maxWidth: 700, margin: '0 auto' }}>
          <GridItem span={6}>
            <Card isSelectable isFlat style={{ height: '100%', textAlign: 'center' }}>
              <CardTitle><Title headingLevel="h3" size="lg">Create New Bundle</Title></CardTitle>
              <CardBody>
                <Content component="p" style={{ marginBottom: '1.5rem' }}>
                  Start from scratch — add cards and configure branding for your event.
                </Content>
                <Button variant="primary" size="lg" onClick={handleNewBundle}>
                  Create New Bundle
                </Button>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem span={6}>
            <Card isSelectable isFlat style={{ height: '100%', textAlign: 'center' }}>
              <CardTitle><Title headingLevel="h3" size="lg">Load Existing Bundle</Title></CardTitle>
              <CardBody>
                <Content component="p" style={{ marginBottom: '1.5rem' }}>
                  Open a previously exported <code>kiosk-*.zip</code> to edit its cards and re-export.
                </Content>
                {loading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                    <Spinner size="md" />
                    <span>Loading bundle…</span>
                  </div>
                ) : (
                  <Button variant="secondary" size="lg" onClick={() => zipInputRef.current.click()}>
                    Load Bundle (ZIP)
                  </Button>
                )}
                <input
                  ref={zipInputRef}
                  type="file"
                  accept=".zip"
                  style={{ display: 'none' }}
                  onChange={handleZipFile}
                />
              </CardBody>
            </Card>
          </GridItem>
        </Grid>
      </EmptyStateBody>
    </EmptyState>
  );
}

import React, { useState, useCallback } from 'react';
import {
  Page, PageSection, Masthead, MastheadMain, MastheadContent,
  Title, Nav, NavItem, NavList, PageSidebar, PageSidebarBody,
  Button, Toolbar, ToolbarContent, ToolbarItem,
  Alert, AlertGroup, AlertActionCloseButton,
} from '@patternfly/react-core';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import CardList from './components/CardList.jsx';
import BrandingEditor from './components/BrandingEditor.jsx';
import { validateCards, validateBranding } from './utils/validation.js';
import { exportZip, defaultBranding, totalMediaSize } from './utils/zipHandler.js';

export default function App() {
  const [view, setView] = useState('welcome'); // 'welcome' | 'editor'
  const [activeTab, setActiveTab] = useState('cards'); // 'cards' | 'branding'
  const [cards, setCards] = useState([]);
  const [branding, setBranding] = useState(defaultBranding);
  const [errors, setErrors] = useState([]);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const handleStart = useCallback((initialCards, initialBranding) => {
    setCards(initialCards);
    setBranding(initialBranding);
    setErrors([]);
    setView('editor');
  }, []);

  const handleExport = useCallback(async () => {
    const cardErrors = validateCards(cards);
    const brandingErrors = validateBranding(branding);
    const all = [...cardErrors, ...brandingErrors];
    if (all.length > 0) {
      setErrors(all);
      setExportSuccess(false);
      return;
    }
    setErrors([]);
    setIsExporting(true);
    setExportProgress(0);
    try {
      await exportZip(cards, branding, pct => setExportProgress(Math.round(pct)));
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    } catch (e) {
      setErrors([`Export failed: ${e.message}`]);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  }, [cards, branding]);

  const masthead = (
    <Masthead style={{ background: '#151515' }}>
      <MastheadMain>
        <Title headingLevel="h1" size="xl" style={{ color: 'white', margin: 0 }}>
          Demo Kiosk Authoring Tool
        </Title>
      </MastheadMain>
      {view === 'editor' && (
        <MastheadContent>
          <Toolbar>
            <ToolbarContent>
              <ToolbarItem>
                <Button variant="primary" onClick={handleExport} isDisabled={isExporting}>
                  {isExporting
                    ? (exportProgress > 0 ? `Preparing… ${exportProgress}%` : 'Preparing…')
                    : 'Download Bundle'}
                </Button>
              </ToolbarItem>
              <ToolbarItem align={{ default: 'alignEnd' }}>
                <Button variant="plain" style={{ color: '#ff7575', border: '1px solid rgba(255,100,100,0.6)', borderRadius: 4, padding: '4px 16px' }} onClick={() => {
                  if (cards.length === 0 || confirm('Discard all changes and return to the start?')) {
                    setCards([]);
                    setBranding(defaultBranding());
                    setErrors([]);
                    setView('welcome');
                  }
                }}>
                  Discard &amp; Start Over
                </Button>
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>
        </MastheadContent>
      )}
    </Masthead>
  );

  const sidebar = view === 'editor' ? (
    <PageSidebar>
      <PageSidebarBody>
        <Nav>
          <NavList>
            <NavItem isActive={activeTab === 'cards'} onClick={() => setActiveTab('cards')}>
              Cards ({cards.length})
            </NavItem>
            <NavItem isActive={activeTab === 'branding'} onClick={() => setActiveTab('branding')}>
              Branding
            </NavItem>
          </NavList>
        </Nav>
      </PageSidebarBody>
    </PageSidebar>
  ) : null;

  return (
    <Page masthead={masthead} sidebar={sidebar}>
      {errors.length > 0 && (
        <PageSection padding={{ default: 'noPadding' }}>
          <AlertGroup>
            <Alert
              variant="danger"
              title={`${errors.length} validation error${errors.length > 1 ? 's' : ''} — fix before exporting`}
              actionClose={<AlertActionCloseButton onClose={() => setErrors([])} />}
            >
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </Alert>
          </AlertGroup>
        </PageSection>
      )}
      {exportSuccess && (
        <PageSection padding={{ default: 'noPadding' }}>
          <AlertGroup>
            <Alert variant="success" title="Bundle exported — upload it via the kiosk /manage panel." />
          </AlertGroup>
        </PageSection>
      )}

      {view === 'welcome' && (
        <PageSection>
          <WelcomeScreen onStart={handleStart} />
        </PageSection>
      )}

      {view === 'editor' && activeTab === 'cards' && (
        <PageSection>
          <CardList cards={cards} setCards={setCards} />
        </PageSection>
      )}

      {view === 'editor' && activeTab === 'branding' && (
        <PageSection>
          <BrandingEditor branding={branding} setBranding={setBranding} />
        </PageSection>
      )}
    </Page>
  );
}

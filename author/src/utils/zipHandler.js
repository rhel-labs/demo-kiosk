import JSZip from 'jszip';
import yaml from 'js-yaml';
import { cardToYaml, brandingToYaml, sanitizeFilename } from './yamlGen.js';

export async function exportZip(cards, branding) {
  const zip = new JSZip();
  const kiosk = zip.folder('kiosk');
  const faqs = kiosk.folder('faqs');
  const brandingFolder = kiosk.folder('branding');
  const media = kiosk.folder('media');

  cards.forEach((card, index) => {
    faqs.file(`${card.id}.yaml`, cardToYaml(card, index));
    addCardMedia(media, card);
  });

  brandingFolder.file('branding.yaml', brandingToYaml(branding));
  addBrandingLogos(brandingFolder, branding);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kiosk-${timestamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function addCardMedia(mediaFolder, card) {
  const { demo } = card;
  if (!demo) return;
  const { type } = demo;
  if ((type === 'video' || type === 'slides' || type === 'asciinema' || type === 'image-text') && demo._mediaFile) {
    mediaFolder.file(sanitizeFilename(demo._mediaFile.name), demo._mediaFile);
  }
  if (type === 'video-loop' && demo._videoFiles) {
    demo._videoFiles.forEach(f => mediaFolder.file(sanitizeFilename(f.name), f));
  }
}

function addBrandingLogos(brandingFolder, branding) {
  // Primary logo is always the bundled Red Hat SVG — not user-supplied.
  const secondaryFile = branding.logos.secondary._file;
  if (secondaryFile) {
    const ext = secondaryFile.name.split('.').pop();
    brandingFolder.file(`logo-secondary.${ext}`, secondaryFile);
  }
}

export async function importZip(file) {
  const zip = await JSZip.loadAsync(file);

  // Locate kiosk/ at any depth (mirrors serve.py logic)
  let kioskPrefix = null;
  zip.forEach(path => {
    if (kioskPrefix === null && /(?:^|\/|^)kiosk\//.test(path)) {
      const m = path.match(/^(.*?kiosk\/)/);
      if (m) kioskPrefix = m[1];
    }
  });
  if (!kioskPrefix) throw new Error('No kiosk/ directory found in zip');

  const cards = await importCards(zip, kioskPrefix);
  const branding = await importBranding(zip, kioskPrefix);

  // Build a map of media filename → File so cards can reference their files
  const mediaFiles = {};
  zip.forEach((path, entry) => {
    if (path.startsWith(kioskPrefix + 'media/') && !entry.dir) {
      const name = path.slice((kioskPrefix + 'media/').length);
      mediaFiles[name] = entry;
    }
  });

  // Attach media File objects to cards
  const cardsWithMedia = await Promise.all(
    cards.map(card => attachMediaFiles(card, mediaFiles))
  );

  // Attach logo files to branding
  const brandingWithLogos = await attachLogoFiles(branding, zip, kioskPrefix);

  return { cards: cardsWithMedia, branding: brandingWithLogos };
}

async function importCards(zip, kioskPrefix) {
  const faqPrefix = kioskPrefix + 'faqs/';
  const yamlEntries = [];
  zip.forEach((path, entry) => {
    if (path.startsWith(faqPrefix) && path.endsWith('.yaml') && !entry.dir) {
      yamlEntries.push(entry);
    }
  });

  const cards = [];
  for (const entry of yamlEntries) {
    const text = await entry.async('text');
    const data = yaml.load(text);
    if (!data || data._template) continue;
    cards.push(yamlToCard(data));
  }

  // Sort by order field from yaml before discarding it
  cards.sort((a, b) => (a._importOrder ?? 0) - (b._importOrder ?? 0));
  cards.forEach(c => delete c._importOrder);
  return cards;
}

function yamlToCard(data) {
  const demo = data.demo || {};
  const card = {
    id: data.id || '',
    title: data.title || '',
    summary: data.summary || '',
    enabled: data.enabled !== false,
    _importOrder: data.order ?? 0,
    demo: {
      type: demo.type || 'video',
      _mediaFile: null,
      _videoFiles: [],
    },
  };

  const { type } = demo;
  if (type === 'video' || type === 'slides' || type === 'asciinema') {
    card.demo.src = demo.src || '';
  } else if (type === 'image-text') {
    card.demo.src = demo.image || '';
    card.demo.caption = demo.caption || '';
  } else if (type === 'external-url' || type === 'lab') {
    card.demo.url = demo.url || '';
    card.demo.long_description = demo.long_description || '';
    if (type === 'lab' && demo.duration) card.demo.duration = demo.duration;
  } else if (type === 'arcade') {
    card.demo.share_url = demo.share_url || '';
    if (demo.title) card.demo.title = demo.title;
    if (demo.aspect_ratio) card.demo.aspect_ratio = demo.aspect_ratio;
  } else if (type === 'video-loop') {
    card.demo.videoPaths = demo.videos || [];
  }
  return card;
}

async function attachMediaFiles(card, mediaFiles) {
  const { demo } = card;
  if (!demo) return card;
  const { type } = demo;

  if (type === 'video' || type === 'slides' || type === 'asciinema' || type === 'image-text') {
    const src = demo.src || '';
    const filename = src.split('/').pop();
    if (filename && mediaFiles[filename]) {
      const blob = await mediaFiles[filename].async('blob');
      demo._mediaFile = new File([blob], filename, { type: guessMime(filename) });
    }
  } else if (type === 'video-loop' && demo.videoPaths) {
    demo._videoFiles = [];
    for (const path of demo.videoPaths) {
      const filename = path.split('/').pop();
      if (filename && mediaFiles[filename]) {
        const blob = await mediaFiles[filename].async('blob');
        demo._videoFiles.push(new File([blob], filename, { type: 'video/mp4' }));
      }
    }
    delete demo.videoPaths;
  }
  return card;
}

async function importBranding(zip, kioskPrefix) {
  const brandingPath = kioskPrefix + 'branding/branding.yaml';
  const entry = zip.file(brandingPath);
  const defaults = defaultBranding();
  if (!entry) return defaults;

  const text = await entry.async('text');
  const data = yaml.load(text);
  if (!data) return defaults;

  const b = defaults;
  if (data.event) {
    b.event.header = data.event.header || '';
    b.event.tagline = data.event.tagline || '';
    b.event.title = data.event.title || '';
  }
  if (data.logos?.secondary) {
    b.logos.secondary.altText = data.logos.secondary.alt_text || '';
    b.logos.secondary.url = data.logos.secondary.url || '';
    b.logos.secondary._existingPath = data.logos.secondary.file || null;
  }
  return b;
}

async function attachLogoFiles(branding, zip, kioskPrefix) {
  const brandingPrefix = kioskPrefix + 'branding/';
  const existingPath = branding.logos.secondary._existingPath;
  if (existingPath) {
    const filename = existingPath.split('/').pop();
    const entry = zip.file(brandingPrefix + filename);
    if (entry) {
      const blob = await entry.async('blob');
      branding.logos.secondary._file = new File([blob], filename, { type: guessMime(filename) });
    }
  }
  return branding;
}

export function defaultBranding() {
  return {
    event: { header: '', tagline: '', title: '' },
    logos: {
      secondary: { altText: '', url: '', _file: null, _existingPath: null },
    },
  };
}

function guessMime(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    mp4: 'video/mp4', webm: 'video/webm',
    pdf: 'application/pdf',
    cast: 'application/octet-stream',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    svg: 'image/svg+xml', webp: 'image/webp',
  };
  return map[ext] || 'application/octet-stream';
}

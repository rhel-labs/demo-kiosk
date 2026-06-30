import yaml from 'js-yaml';

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9.\-_ ]/g, '_');
}

function mediaPath(file) {
  return `content/media/${sanitizeFilename(file.name)}`;
}

function logoPath(file, role) {
  const ext = file.name.split('.').pop();
  return `content/branding/logo-${role}.${ext}`;
}

export function cardToYaml(card) {
  const obj = {
    id: card.id,
    title: card.title,
    summary: card.summary,
    enabled: card.enabled !== false,
    demo: buildDemo(card.demo),
  };
  if (card.spotlight) obj.spotlight = true;
  if (card.family) obj.family = card.family;
  return yaml.dump(obj, { lineWidth: 120, quotingType: '"', forceQuotes: false });
}

function buildDemo(demo) {
  const { type } = demo;
  if (type === 'video' || type === 'slides' || type === 'asciinema') {
    const src = demo._mediaFile ? mediaPath(demo._mediaFile) : (demo.src || '');
    return { type, src };
  }
  if (type === 'image-text') {
    const image = demo._mediaFile ? mediaPath(demo._mediaFile) : (demo.src || '');
    return { type, image, caption: demo.caption };
  }
  if (type === 'external-url') {
    return { type, url: demo.url, long_description: demo.long_description };
  }
  if (type === 'lab') {
    const d = { type, url: demo.url, long_description: demo.long_description };
    if (demo.duration) d.duration = demo.duration;
    return d;
  }
  if (type === 'arcade') {
    const d = { type, share_url: demo.share_url };
    if (demo.title) d.title = demo.title;
    if (demo.aspect_ratio) d.aspect_ratio = demo.aspect_ratio;
    return d;
  }
  if (type === 'video-loop') {
    return { type, videos: demo._videoFiles.map(f => mediaPath(f)) };
  }
  return { type };
}

export function brandingToYaml(branding) {
  const primaryFile   = branding.logos.primary?._file;
  const primaryPath   = primaryFile
    ? `content/branding/${primaryFile.name}`
    : (branding.logos.primary?._existingPath || 'content/branding/logo-redhat.svg');

  const secondaryFile = branding.logos.secondary._file;
  const secondaryPath = secondaryFile
    ? logoPath(secondaryFile, 'secondary')
    : branding.logos.secondary._existingPath || 'content/branding/logo-secondary.svg';

  const obj = {
    event: {
      header:  branding.event.header,
      tagline: branding.event.tagline || '',
      title:   branding.event.title   || '',
    },
    logos: {
      primary: {
        file: primaryPath,
        alt_text: 'Red Hat',
        url: 'https://www.redhat.com',
      },
      secondary: {
        file: secondaryPath,
        alt_text: branding.logos.secondary.altText || 'Event Logo',
        ...(branding.logos.secondary.url ? { url: branding.logos.secondary.url } : {}),
      },
    },
    colors: {
      brand_primary: '#ee0000',
      brand_hover: '#c00000',
      page_background: '#f2f2f2',
      header_background: '#151515',
    },
    layout: {
      card_columns: 3,
      idle_timeout_seconds: 30,
      countdown_seconds: 10,
    },
    footer: {
      copyright: 'Red Hat, Inc.',
    },
  };
  return yaml.dump(obj, { lineWidth: 120 });
}

export function indexToYaml(cards, categories) {
  const obj = {
    schema_version: 2,
    card_order: cards.map(c => c.id),
    categories: categories.map(cat => ({ name: cat.name, cards: cat.cards })),
  };
  return yaml.dump(obj, { lineWidth: 120, quotingType: '"', forceQuotes: false });
}

export { sanitizeFilename, mediaPath, logoPath };

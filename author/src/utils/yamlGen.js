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

export function cardToYaml(card, index) {
  const order = (index + 1) * 10;
  const obj = {
    id: card.id,
    order,
    title: card.title,
    summary: card.summary,
    enabled: card.enabled !== false,
    demo: buildDemo(card.demo),
  };
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
  const secondaryFile = branding.logos.secondary._file;
  const secondaryPath = secondaryFile
    ? logoPath(secondaryFile, 'secondary')
    : branding.logos.secondary._existingPath || 'content/branding/logo-secondary.svg';

  const obj = {
    event: {
      header: branding.event.header,
      ...(branding.event.tagline ? { tagline: branding.event.tagline } : {}),
      ...(branding.event.title ? { title: branding.event.title } : {}),
    },
    logos: {
      primary: {
        file: 'content/branding/logo-redhat.svg',
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

export { sanitizeFilename, mediaPath, logoPath };

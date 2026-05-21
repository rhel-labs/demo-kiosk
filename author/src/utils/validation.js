const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;
const ARCADE_SHARE_RE = /^https:\/\/(?:interact\.redhat\.com|app\.arcade\.software)\/share\/([A-Za-z0-9_-]+)/;
const ARCADE_DEMO_RE = /^https:\/\/demo\.arcade\.software\/([A-Za-z0-9_-]+)/;

const VALID_TYPES = new Set([
  'video', 'slides', 'asciinema', 'image-text',
  'external-url', 'lab', 'arcade', 'video-loop',
]);

function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateDemo(demo, cardLabel) {
  const errors = [];
  if (!demo || typeof demo !== 'object') {
    return [`${cardLabel}: demo block is missing`];
  }
  const { type } = demo;
  if (!type) return [`${cardLabel}: demo.type is required`];
  if (!VALID_TYPES.has(type)) {
    return [`${cardLabel}: unknown demo type "${type}"`];
  }

  if (type === 'video' || type === 'slides' || type === 'asciinema') {
    if (!demo._mediaFile && !demo.src) {
      errors.push(`${cardLabel}: a media file is required for type "${type}"`);
    }
  } else if (type === 'image-text') {
    if (!demo._mediaFile && !demo.src) errors.push(`${cardLabel}: an image file is required`);
  } else if (type === 'external-url') {
    if (!demo.url) errors.push(`${cardLabel}: url is required`);
    else if (!isValidUrl(demo.url)) errors.push(`${cardLabel}: url must be a valid http/https URL`);
    if (!demo.long_description || !demo.long_description.trim()) {
      errors.push(`${cardLabel}: long_description is required`);
    }
  } else if (type === 'lab') {
    if (!demo.url) errors.push(`${cardLabel}: url is required`);
    else if (!isValidUrl(demo.url)) errors.push(`${cardLabel}: url must be a valid http/https URL`);
    if (!demo.long_description || !demo.long_description.trim()) {
      errors.push(`${cardLabel}: long_description is required`);
    }
  } else if (type === 'arcade') {
    if (!demo.share_url) {
      errors.push(`${cardLabel}: share_url is required`);
    } else if (!ARCADE_SHARE_RE.test(demo.share_url) && !ARCADE_DEMO_RE.test(demo.share_url)) {
      errors.push(`${cardLabel}: share_url must be an Arcade share link (interact.redhat.com/share/... or app.arcade.software/share/...)`);
    }
  } else if (type === 'video-loop') {
    if (!demo._videoFiles || demo._videoFiles.length === 0) {
      errors.push(`${cardLabel}: at least one video file is required for video-loop`);
    }
  }
  return errors;
}

export function validateCards(cards) {
  const errors = [];
  const seenIds = new Map();

  cards.forEach((card, index) => {
    const label = card.title ? `"${card.title}"` : `card #${index + 1}`;

    if (!card.id || !card.id.trim()) {
      errors.push(`${label}: id is required`);
    } else if (!ID_RE.test(card.id)) {
      errors.push(`${label}: id must be lowercase alphanumeric with hyphens, starting with a letter or digit`);
    } else if (seenIds.has(card.id)) {
      errors.push(`${label}: duplicate id "${card.id}" (also used by "${seenIds.get(card.id)}")`);
    } else {
      seenIds.set(card.id, label);
    }

    if (!card.title || !card.title.trim()) errors.push(`${label}: title is required`);
    if (card.demo?.type !== 'video-loop' && (!card.summary || !card.summary.trim())) {
      errors.push(`${label}: summary is required`);
    }

    errors.push(...validateDemo(card.demo, label));
  });

  return errors;
}

export function validateBranding(branding) {
  const errors = [];
  if (!branding.event?.header?.trim()) {
    errors.push('Event header is required');
  }
  return errors;
}

export { isValidUrl, HEX_COLOR_RE };

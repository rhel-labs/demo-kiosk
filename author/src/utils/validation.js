// Validation rules derived from build/bundle-spec.yaml — update together.

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const ARCADE_SHARE_RE = /^https:\/\/(?:interact\.redhat\.com|app\.arcade\.software)\/share\/([A-Za-z0-9_-]+)/;
const ARCADE_DEMO_RE = /^https:\/\/demo\.arcade\.software\/([A-Za-z0-9_-]+)/;

const FAMILY_VALUES = new Set([
  'RHEL', 'RHEL AI', 'OpenShift', 'OpenShift AI', 'OpenShift Virt',
  'AAP', 'RHACS', 'Satellite', 'Lightspeed', 'Developer Hub',
  'Quay', 'Red Hat AI', 'Edge',
]);

const SUMMARY_OPTIONAL_FOR = new Set(['video-loop']);

const DEMO_TYPE_SPEC = {
  video:          { required: ['src'],                  mediaFields: ['src'] },
  slides:         { required: ['src'],                  mediaFields: ['src'] },
  asciinema:      { required: ['src'],                  mediaFields: ['src'] },
  'image-text':   { required: ['image', 'caption'],     mediaFields: ['image'] },
  'external-url': { required: ['url', 'long_description'], urlFields: ['url'] },
  lab:            { required: ['url', 'long_description'], urlFields: ['url'] },
  arcade:         { required: ['share_url'],            arcadeUrlFields: ['share_url'] },
  'video-loop':   { required: ['videos'],               mediaListFields: ['videos'] },
};

function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isArcadeUrl(value) {
  return ARCADE_SHARE_RE.test(value) || ARCADE_DEMO_RE.test(value);
}

function hasMediaFile(demo, field) {
  if (field === 'src' || field === 'image') return !!(demo._mediaFile || demo[field]);
  return !!demo[field];
}

function validateDemo(demo, cardLabel) {
  const errors = [];
  if (!demo || typeof demo !== 'object') {
    return [`${cardLabel}: demo block is missing`];
  }
  const { type } = demo;
  if (!type) return [`${cardLabel}: demo.type is required`];

  const spec = DEMO_TYPE_SPEC[type];
  if (!spec) return [`${cardLabel}: unknown demo type "${type}"`];

  for (const field of spec.required) {
    if (spec.mediaFields?.includes(field)) {
      if (!hasMediaFile(demo, field)) {
        errors.push(`${cardLabel}: ${field} is required for type "${type}"`);
      }
    } else if (spec.mediaListFields?.includes(field)) {
      const list = demo._videoFiles || demo[field];
      if (!list || !Array.isArray(list) || list.length === 0) {
        errors.push(`${cardLabel}: at least one entry in ${field} is required for type "${type}"`);
      }
    } else if (spec.urlFields?.includes(field)) {
      if (!demo[field]) {
        errors.push(`${cardLabel}: ${field} is required`);
      } else if (!isValidUrl(demo[field])) {
        errors.push(`${cardLabel}: ${field} must be a valid http/https URL`);
      }
    } else if (spec.arcadeUrlFields?.includes(field)) {
      if (!demo[field]) {
        errors.push(`${cardLabel}: ${field} is required`);
      } else if (!isArcadeUrl(demo[field])) {
        errors.push(`${cardLabel}: ${field} must be an Arcade share link (interact.redhat.com/share/... or app.arcade.software/share/...)`);
      }
    } else {
      if (!demo[field] || (typeof demo[field] === 'string' && !demo[field].trim())) {
        errors.push(`${cardLabel}: ${field} is required for type "${type}"`);
      }
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

    if (!SUMMARY_OPTIONAL_FOR.has(card.demo?.type) && (!card.summary || !card.summary.trim())) {
      errors.push(`${label}: summary is required`);
    }

    if (card.family && !FAMILY_VALUES.has(card.family)) {
      errors.push(`${label}: invalid product family "${card.family}"`);
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

export { isValidUrl, FAMILY_VALUES };

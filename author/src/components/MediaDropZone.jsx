// Headless file-processing utility — no rendered UI.
// CardList owns the visual drop target and the "Add Files" button.

const EXT_TO_TYPE = {
  mp4: 'video', webm: 'video',
  pdf: 'slides',
  cast: 'asciinema',
  png: 'image-text', jpg: 'image-text', jpeg: 'image-text',
  svg: 'image-text', webp: 'image-text',
};

export const ACCEPT = '.mp4,.webm,.pdf,.cast,.png,.jpg,.jpeg,.svg,.webp';

function inferType(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return EXT_TO_TYPE[ext] || null;
}

function slugify(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'card';
}

export function fileToCard(file) {
  const type = inferType(file);
  if (!type) return null;
  return {
    id: slugify(file.name),
    title: '',
    summary: '',
    enabled: true,
    demo: { type, _mediaFile: file, _videoFiles: [], caption: '' },
  };
}

export function processFiles(files) {
  const cards = [];
  const rejected = [];
  for (const f of files) {
    const card = fileToCard(f);
    if (card) cards.push(card);
    else rejected.push(f.name);
  }
  return { cards, rejected };
}

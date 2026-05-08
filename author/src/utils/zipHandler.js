import JSZip from 'jszip';
import yaml from 'js-yaml';
import { cardToYaml, brandingToYaml, sanitizeFilename } from './yamlGen.js';

// ── CRC-32 (ZIP standard) ─────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf, state = 0xFFFFFFFF) {
  let c = state;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return c;
}
function crc32Final(state) { return (state ^ 0xFFFFFFFF) >>> 0; }

// ── Streaming ZIP writer (STORE compression only) ─────────────────
// Reads File objects via file.stream().getReader() so peak memory per
// file is one stream chunk (~64 KB), not the full file size.  This
// allows bundles well over 1 GB without ArrayBuffer allocation errors.
// onChunk may return a Promise (FileSystemWritableFileStream); the
// writer awaits each emission so writes stay in order with backpressure.
class ZipBuilder {
  constructor(onChunk) {
    this._emit  = async (buf) => { await onChunk(buf); this._offset += buf.length; };
    this._offset  = 0;
    this._entries = [];
  }

  _localHeader(nameBytes, crc, size, descriptor) {
    const h = new Uint8Array(30 + nameBytes.length);
    const v = new DataView(h.buffer);
    v.setUint32(0,  0x04034b50,           true); // local file header sig
    v.setUint16(4,  20,                   true); // version needed
    v.setUint16(6,  descriptor ? 8 : 0,   true); // bit 3 = data descriptor
    v.setUint16(8,  0,                    true); // compression: STORE
    v.setUint16(10, 0,                    true); // mod time
    v.setUint16(12, 0,                    true); // mod date
    v.setUint32(14, descriptor ? 0 : crc, true);
    v.setUint32(18, descriptor ? 0 : size,true);
    v.setUint32(22, descriptor ? 0 : size,true);
    v.setUint16(26, nameBytes.length,     true);
    v.setUint16(28, 0,                    true); // extra field length
    h.set(nameBytes, 30);
    return h;
  }

  _dataDescriptor(crc, size) {
    const d = new Uint8Array(16);
    const v = new DataView(d.buffer);
    v.setUint32(0, 0x08074b50, true);
    v.setUint32(4, crc,        true);
    v.setUint32(8, size,       true); // compressed  (= uncompressed for STORE)
    v.setUint32(12, size,      true); // uncompressed
    return d;
  }

  // Small text content — size and CRC known upfront, no data descriptor.
  async addText(path, content) {
    const enc       = new TextEncoder();
    const nameBytes = enc.encode(path);
    const data      = enc.encode(content);
    const crcVal    = crc32Final(crc32(data));
    const localOff  = this._offset;
    await this._emit(this._localHeader(nameBytes, crcVal, data.length, false));
    await this._emit(data);
    this._entries.push({ nameBytes, localOff, crc: crcVal, size: data.length, descriptor: false });
  }

  // Binary File — streamed in chunks; CRC and size go in a data descriptor.
  // onBytes(byteCount) is called after each chunk for progress reporting.
  async addFile(path, file, onBytes) {
    const enc       = new TextEncoder();
    const nameBytes = enc.encode(path);
    const localOff  = this._offset;
    await this._emit(this._localHeader(nameBytes, 0, 0, true));

    let crcState = 0xFFFFFFFF;
    let size     = 0;
    const reader = file.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      crcState = crc32(value, crcState);
      size    += value.length;
      await this._emit(value);
      onBytes?.(value.length);
    }
    const crcVal = crc32Final(crcState);
    await this._emit(this._dataDescriptor(crcVal, size));
    this._entries.push({ nameBytes, localOff, crc: crcVal, size, descriptor: true });
  }

  async finalize() {
    const cdOff = this._offset;
    let   cdSize = 0;
    for (const { nameBytes, localOff, crc, size, descriptor } of this._entries) {
      const e = new Uint8Array(46 + nameBytes.length);
      const v = new DataView(e.buffer);
      v.setUint32(0,  0x02014b50,         true); // central dir sig
      v.setUint16(4,  20,                 true); // version made by
      v.setUint16(6,  20,                 true); // version needed
      v.setUint16(8,  descriptor ? 8 : 0, true); // flags match local header
      v.setUint16(10, 0,                  true); // STORE
      v.setUint16(12, 0,                  true); // mod time
      v.setUint16(14, 0,                  true); // mod date
      v.setUint32(16, crc,                true);
      v.setUint32(20, size,               true);
      v.setUint32(24, size,               true);
      v.setUint16(28, nameBytes.length,   true);
      v.setUint16(30, 0,                  true); // extra length
      v.setUint16(32, 0,                  true); // comment length
      v.setUint16(34, 0,                  true); // disk start
      v.setUint16(36, 0,                  true); // internal attrs
      v.setUint32(38, 0,                  true); // external attrs
      v.setUint32(42, localOff,           true); // local header offset
      e.set(nameBytes, 46);
      await this._emit(e);
      cdSize += e.length;
    }
    const eocd = new Uint8Array(22);
    const v    = new DataView(eocd.buffer);
    v.setUint32(0,  0x06054b50,             true); // EOCD sig
    v.setUint16(4,  0,                      true);
    v.setUint16(6,  0,                      true);
    v.setUint16(8,  this._entries.length,   true);
    v.setUint16(10, this._entries.length,   true);
    v.setUint32(12, cdSize,                 true);
    v.setUint32(16, cdOff,                  true);
    v.setUint16(20, 0,                      true);
    await this._emit(eocd);
  }
}


// ── exportZip ─────────────────────────────────────────────────────
export async function exportZip(cards, branding, onProgress) {
  // Collect entries, deduplicating media files by sanitized filename.
  const addedFiles  = new Set();
  const textEntries = [];
  const fileEntries = [];

  cards.forEach((card, index) => {
    textEntries.push({ path: `kiosk/faqs/${card.id}.yaml`, content: cardToYaml(card, index) });
    const { demo } = card;
    if (!demo) return;
    const { type } = demo;
    if ((type === 'video' || type === 'slides' || type === 'asciinema' || type === 'image-text') && demo._mediaFile) {
      const name = sanitizeFilename(demo._mediaFile.name);
      if (!addedFiles.has(name)) { addedFiles.add(name); fileEntries.push({ path: `kiosk/media/${name}`, file: demo._mediaFile }); }
    }
    if (type === 'video-loop' && demo._videoFiles) {
      demo._videoFiles.forEach(f => {
        const name = sanitizeFilename(f.name);
        if (!addedFiles.has(name)) { addedFiles.add(name); fileEntries.push({ path: `kiosk/media/${name}`, file: f }); }
      });
    }
  });

  textEntries.push({ path: 'kiosk/branding/branding.yaml', content: brandingToYaml(branding) });
  const secondaryFile = branding.logos.secondary._file;
  if (secondaryFile) {
    const ext = secondaryFile.name.split('.').pop();
    fileEntries.push({ path: `kiosk/branding/logo-secondary.${ext}`, file: secondaryFile });
  }

  const totalBytes  = fileEntries.reduce((s, e) => s + e.file.size, 0) || 1;
  let   bytesWritten = 0;
  const filename    = `kiosk-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.zip`;

  async function build(onChunk) {
    const zip = new ZipBuilder(onChunk);
    for (const { path, content } of textEntries) {
      await zip.addText(path, content);
    }
    for (const { path, file } of fileEntries) {
      await zip.addFile(path, file, (n) => {
        bytesWritten += n;
        onProgress?.(Math.round(bytesWritten / totalBytes * 100));
      });
    }
    await zip.finalize();
  }

  if ('showSaveFilePicker' in window) {
    // Streams directly to disk chunk-by-chunk; handles bundles of any size
    // without buffering more than one stream chunk (~64 KB) per file.
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Kiosk Bundle', accept: { 'application/zip': ['.zip'] } }],
      });
    } catch (e) {
      if (e.name === 'AbortError') return;
      throw e;
    }
    const writable = await handle.createWritable();
    await build(chunk => writable.write(chunk));
    await writable.close();
  } else {
    // Fallback: collects all chunks then triggers a download link.
    // Requires the full zip to fit in available RAM; suitable for
    // bundles up to ~1–2 GB depending on system memory.
    // For larger bundles, access the app via HTTPS or localhost so
    // the browser exposes showSaveFilePicker for direct disk streaming.
    const chunks = [];
    await build(chunk => chunks.push(chunk));
    const blob = new Blob(chunks, { type: 'application/zip' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Returns total size in bytes of unique media files across all cards.
// Deduplicates by filename so shared video-loop files are counted once.
export function totalMediaSize(cards) {
  const seen = new Set();
  let total  = 0;
  for (const card of cards) {
    const { demo } = card;
    if (!demo) continue;
    if (demo._mediaFile) {
      const name = sanitizeFilename(demo._mediaFile.name);
      if (!seen.has(name)) { seen.add(name); total += demo._mediaFile.size; }
    }
    if (demo._videoFiles) demo._videoFiles.forEach(f => {
      const name = sanitizeFilename(f.name);
      if (!seen.has(name)) { seen.add(name); total += f.size; }
    });
  }
  return total;
}


// ── importZip — JSZip-based, reads an existing bundle ────────────
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

  const cards   = await importCards(zip, kioskPrefix);
  const branding = await importBranding(zip, kioskPrefix);

  const mediaFiles = {};
  zip.forEach((path, entry) => {
    if (path.startsWith(kioskPrefix + 'media/') && !entry.dir) {
      const name = path.slice((kioskPrefix + 'media/').length);
      mediaFiles[name] = entry;
    }
  });

  const cardsWithMedia    = await Promise.all(cards.map(card => attachMediaFiles(card, mediaFiles)));
  const brandingWithLogos = await attachLogoFiles(branding, zip, kioskPrefix);
  return { cards: cardsWithMedia, branding: brandingWithLogos };
}

async function importCards(zip, kioskPrefix) {
  const faqPrefix  = kioskPrefix + 'faqs/';
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

  cards.sort((a, b) => (a._importOrder ?? 0) - (b._importOrder ?? 0));
  cards.forEach(c => delete c._importOrder);
  return cards;
}

function yamlToCard(data) {
  const demo = data.demo || {};
  const card = {
    id:           data.id || '',
    title:        data.title || '',
    summary:      data.summary || '',
    enabled:      data.enabled !== false,
    _importOrder: data.order ?? 0,
    demo: { type: demo.type || 'video', _mediaFile: null, _videoFiles: [] },
  };

  const { type } = demo;
  if (type === 'video' || type === 'slides' || type === 'asciinema') {
    card.demo.src = demo.src || '';
  } else if (type === 'image-text') {
    card.demo.src     = demo.image || '';
    card.demo.caption = demo.caption || '';
  } else if (type === 'external-url' || type === 'lab') {
    card.demo.url              = demo.url || '';
    card.demo.long_description = demo.long_description || '';
    if (type === 'lab' && demo.duration) card.demo.duration = demo.duration;
  } else if (type === 'arcade') {
    card.demo.share_url = demo.share_url || '';
    if (demo.title)        card.demo.title        = demo.title;
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
    const src      = demo.src || '';
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
  const entry    = zip.file(kioskPrefix + 'branding/branding.yaml');
  const defaults = defaultBranding();
  if (!entry) return defaults;

  const text = await entry.async('text');
  const data = yaml.load(text);
  if (!data) return defaults;

  const b = defaults;
  if (data.event) {
    b.event.header  = data.event.header  || '';
    b.event.tagline = data.event.tagline || '';
    b.event.title   = data.event.title   || '';
  }
  if (data.logos?.secondary) {
    b.logos.secondary.altText        = data.logos.secondary.alt_text || '';
    b.logos.secondary.url            = data.logos.secondary.url      || '';
    b.logos.secondary._existingPath  = data.logos.secondary.file     || null;
  }
  return b;
}

async function attachLogoFiles(branding, zip, kioskPrefix) {
  const existingPath = branding.logos.secondary._existingPath;
  if (existingPath) {
    const filename = existingPath.split('/').pop();
    const entry    = zip.file(kioskPrefix + 'branding/' + filename);
    if (entry) {
      const blob = await entry.async('blob');
      branding.logos.secondary._file = new File([blob], filename, { type: guessMime(filename) });
    }
  }
  return branding;
}

export function defaultBranding() {
  return {
    event:  { header: '', tagline: '', title: '' },
    logos:  { secondary: { altText: '', url: '', _file: null, _existingPath: null } },
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

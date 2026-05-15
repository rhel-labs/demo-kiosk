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

// ── 64-bit helpers ────────────────────────────────────────────────
// JS bitwise operators coerce to signed int32, so & 0xFFFFFFFF
// corrupts values with bit 31 set.  Use % instead.
function lo32(n) { return n % 0x100000000; }
function hi32(n) { return Math.floor(n / 0x100000000); }

function setUint64LE(view, offset, value) {
  view.setUint32(offset,     lo32(value), true);
  view.setUint32(offset + 4, hi32(value), true);
}

// ── Streaming ZIP writer (STORE, ZIP64-capable) ───────────────────
// Reads File objects via file.stream().getReader() so peak memory per
// file is one stream chunk (~64 KB), not the full file size.  Emits
// ZIP64 extensions whenever any size or offset field would overflow
// a 32-bit value, so bundles of any size are produced correctly.
// onChunk may return a Promise (FileSystemWritableFileStream); the
// writer awaits each emission so writes stay in order with backpressure.
class ZipBuilder {
  constructor(onChunk) {
    this._emit  = async (buf) => { await onChunk(buf); this._offset += buf.length; };
    this._offset  = 0;
    this._entries = [];
  }

  // sizeLarge: true when file size > 4 GB (ZIP64 local header + descriptor needed)
  _localHeader(nameBytes, crc, size, descriptor, sizeLarge = false) {
    // When sizeLarge, add a ZIP64 extra field (20 bytes: 4 header + 8 uncompr + 8 compr)
    // with sentinel values 0xFFFFFFFF since actual sizes go in the data descriptor.
    const extraLen = sizeLarge ? 20 : 0;
    const h = new Uint8Array(30 + nameBytes.length + extraLen);
    const v = new DataView(h.buffer);
    v.setUint32(0,  0x04034b50,                   true); // local file header sig
    v.setUint16(4,  sizeLarge ? 45 : 20,          true); // version needed (45 = ZIP64)
    v.setUint16(6,  descriptor ? 8 : 0,           true); // bit 3 = data descriptor
    v.setUint16(8,  0,                            true); // compression: STORE
    v.setUint16(10, 0,                            true); // mod time
    v.setUint16(12, 0,                            true); // mod date
    v.setUint32(14, descriptor ? 0 : crc,         true);
    // Size fields: use 0xFFFFFFFF sentinel when sizeLarge (actual in descriptor/ZIP64 extra)
    v.setUint32(18, (descriptor || sizeLarge) ? 0xFFFFFFFF : size, true); // compressed
    v.setUint32(22, (descriptor || sizeLarge) ? 0xFFFFFFFF : size, true); // uncompressed
    v.setUint16(26, nameBytes.length,             true);
    v.setUint16(28, extraLen,                     true);
    h.set(nameBytes, 30);
    if (sizeLarge) {
      // ZIP64 extended information extra field
      v.setUint16(30 + nameBytes.length,     0x0001, true); // tag
      v.setUint16(30 + nameBytes.length + 2, 16,     true); // data size
      // Uncompressed and compressed sizes: sentinels since data descriptor holds actuals
      setUint64LE(v, 30 + nameBytes.length + 4,  0xFFFFFFFF);
      setUint64LE(v, 30 + nameBytes.length + 12, 0xFFFFFFFF);
    }
    return h;
  }

  // sizeLarge: true when size > 4 GB → use 8-byte size fields (ZIP64 data descriptor)
  _dataDescriptor(crc, size, sizeLarge = false) {
    if (sizeLarge) {
      const d = new Uint8Array(24);
      const v = new DataView(d.buffer);
      v.setUint32(0, 0x08074b50, true);
      v.setUint32(4, crc,        true);
      setUint64LE(v, 8,  size); // compressed
      setUint64LE(v, 16, size); // uncompressed
      return d;
    }
    const d = new Uint8Array(16);
    const v = new DataView(d.buffer);
    v.setUint32(0,  0x08074b50, true);
    v.setUint32(4,  crc,        true);
    v.setUint32(8,  size,       true); // compressed
    v.setUint32(12, size,       true); // uncompressed
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
    this._entries.push({ nameBytes, localOff, crc: crcVal, size: data.length,
                         descriptor: false, sizeLarge: false });
  }

  // Binary File — streamed in chunks; CRC and size go in a data descriptor.
  // onBytes(byteCount) is called after each chunk for progress reporting.
  async addFile(path, file, onBytes) {
    const enc       = new TextEncoder();
    const nameBytes = enc.encode(path);
    const sizeLarge = file.size > 0xFFFFFFFF;
    const localOff  = this._offset;
    await this._emit(this._localHeader(nameBytes, 0, 0, true, sizeLarge));

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
    await this._emit(this._dataDescriptor(crcVal, size, sizeLarge));
    this._entries.push({ nameBytes, localOff, crc: crcVal, size,
                         descriptor: true, sizeLarge });
  }

  async finalize() {
    const cdOff = this._offset;
    let   cdSize = 0;
    for (const { nameBytes, localOff, crc, size, descriptor, sizeLarge } of this._entries) {
      const offsetLarge = localOff > 0xFFFFFFFF;
      const needsZip64  = sizeLarge || offsetLarge;

      // Build ZIP64 extra field: sizes (if sizeLarge) then offset (if offsetLarge)
      let zip64DataLen = 0;
      if (sizeLarge)   zip64DataLen += 16; // uncompressed + compressed (8 bytes each)
      if (offsetLarge) zip64DataLen += 8;  // local header offset (8 bytes)
      const extraLen = needsZip64 ? 4 + zip64DataLen : 0;

      const e = new Uint8Array(46 + nameBytes.length + extraLen);
      const v = new DataView(e.buffer);
      v.setUint32(0,  0x02014b50,                               true); // central dir sig
      v.setUint16(4,  needsZip64 ? 45 : 20,                    true); // version made by
      v.setUint16(6,  needsZip64 ? 45 : 20,                    true); // version needed
      v.setUint16(8,  descriptor ? 8 : 0,                      true); // flags match local
      v.setUint16(10, 0,                                        true); // STORE
      v.setUint16(12, 0,                                        true); // mod time
      v.setUint16(14, 0,                                        true); // mod date
      v.setUint32(16, crc,                                      true);
      v.setUint32(20, sizeLarge ? 0xFFFFFFFF : size,            true); // compressed
      v.setUint32(24, sizeLarge ? 0xFFFFFFFF : size,            true); // uncompressed
      v.setUint16(28, nameBytes.length,                         true);
      v.setUint16(30, extraLen,                                 true);
      v.setUint16(32, 0,                                        true); // comment length
      v.setUint16(34, 0,                                        true); // disk start
      v.setUint16(36, 0,                                        true); // internal attrs
      v.setUint32(38, 0,                                        true); // external attrs
      v.setUint32(42, offsetLarge ? 0xFFFFFFFF : localOff,      true); // local header offset
      e.set(nameBytes, 46);

      if (needsZip64) {
        let pos = 46 + nameBytes.length;
        v.setUint16(pos,     0x0001,       true); // ZIP64 tag
        v.setUint16(pos + 2, zip64DataLen, true); // data length
        pos += 4;
        if (sizeLarge) {
          setUint64LE(v, pos,     size); // uncompressed
          setUint64LE(v, pos + 8, size); // compressed (= uncompressed for STORE)
          pos += 16;
        }
        if (offsetLarge) {
          setUint64LE(v, pos, localOff);
          pos += 8;
        }
      }

      await this._emit(e);
      cdSize += e.length;
    }

    const needsZip64Eocd = cdOff > 0xFFFFFFFF || cdSize > 0xFFFFFFFF
                         || this._entries.length > 65535;

    if (needsZip64Eocd) {
      // ZIP64 EOCD record (56 bytes)
      const z64eocd = new Uint8Array(56);
      const ze = new DataView(z64eocd.buffer);
      ze.setUint32(0,  0x06064b50, true); // ZIP64 EOCD sig
      setUint64LE(ze, 4, 44);            // size of record after first 12 bytes = 44
      ze.setUint16(12, 45, true);        // version made by
      ze.setUint16(14, 45, true);        // version needed
      ze.setUint32(16, 0,  true);        // disk number
      ze.setUint32(20, 0,  true);        // disk with CD start
      setUint64LE(ze, 24, this._entries.length); // entries on this disk
      setUint64LE(ze, 32, this._entries.length); // total entries
      setUint64LE(ze, 40, cdSize);               // CD size
      setUint64LE(ze, 48, cdOff);                // CD offset
      await this._emit(z64eocd);

      // ZIP64 EOCD locator (20 bytes)
      const z64eocdOff = cdOff + cdSize; // offset of ZIP64 EOCD from file start
      const z64loc = new Uint8Array(20);
      const zl = new DataView(z64loc.buffer);
      zl.setUint32(0,  0x07064b50, true); // locator sig
      zl.setUint32(4,  0,          true); // disk with ZIP64 EOCD
      setUint64LE(zl, 8, z64eocdOff);
      zl.setUint32(16, 1,          true); // total disks
      await this._emit(z64loc);
    }

    // Standard EOCD — always required; sentinels when ZIP64
    const eocd = new Uint8Array(22);
    const v    = new DataView(eocd.buffer);
    v.setUint32(0,  0x06054b50,                                           true);
    v.setUint16(4,  0,                                                    true);
    v.setUint16(6,  0,                                                    true);
    v.setUint16(8,  needsZip64Eocd ? 0xFFFF : this._entries.length,      true);
    v.setUint16(10, needsZip64Eocd ? 0xFFFF : this._entries.length,      true);
    v.setUint32(12, needsZip64Eocd ? 0xFFFFFFFF : cdSize,                true);
    v.setUint32(16, needsZip64Eocd ? 0xFFFFFFFF : cdOff,                 true);
    v.setUint16(20, 0,                                                    true);
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
  const primaryFile = branding.logos.primary?._file;
  if (primaryFile) {
    fileEntries.push({ path: `kiosk/branding/${primaryFile.name}`, file: primaryFile });
  }
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


// ── importZip — streaming random-access reader ───────────────────
// Reads only the EOCD and central directory from the file tail, then
// slices individual entries on demand.  Never allocates an ArrayBuffer
// for the entire file, so bundles of any size load without OOM.

async function sliceBuffer(file, start, length) {
  return file.slice(start, start + length).arrayBuffer();
}

// Decompress raw DEFLATE data (compression method 8 in ZIP).
// Write and read run concurrently to avoid backpressure deadlock: if the
// decompressed output fills the TransformStream queue, the writer blocks
// until the reader drains it.  Awaiting writer.close() before reading
// causes an indefinite hang for any entry large enough to fill the queue.
async function inflate(buf) {
  const ds     = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  const writePromise = (async () => {
    await writer.write(new Uint8Array(buf));
    await writer.close();
  })();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  await writePromise;
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out.buffer;
}

// Lazy file-like wrapper for a zip entry — decompresses on demand via .stream().
// Has .name, .size, and .type for UI display (compatible with ZipBuilder.addFile).
// Not a Blob, so CardPreview must check instanceof Blob before createObjectURL.
class ZipEntryFile {
  constructor(sourceFile, entry, filename, mimeType) {
    this.name = filename;
    this.size = entry.size;
    this.type = mimeType;
    this._sourceFile = sourceFile;
    this._entry = entry;
  }

  stream() {
    const src = this._sourceFile;
    const e   = this._entry;
    return new ReadableStream({
      async start(controller) {
        const lhBuf = await src.slice(e.localOff, e.localOff + 30).arrayBuffer();
        const lh    = new DataView(lhBuf);
        const dataStart = e.localOff + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        let stream = src.slice(dataStart, dataStart + e.compSize).stream();
        if (e.compressType === 8) stream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) { controller.close(); break; }
          controller.enqueue(value);
        }
      },
    });
  }
}

// Parse the central directory from a File, returning a Map of
// path → { localOff, size, compSize, compressType, flags }.
// Handles both standard and ZIP64.
async function readZipCentral(file) {
  const fileSize = file.size;

  // Read the last 64 KB to locate the EOCD signature.
  const tailSize = Math.min(65536, fileSize);
  const tailBuf  = await sliceBuffer(file, fileSize - tailSize, tailSize);
  const tail     = new DataView(tailBuf);

  // Search backwards for EOCD signature 0x06054b50.
  let eocdPos = -1;
  for (let i = tailSize - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) { eocdPos = i; break; }
  }
  if (eocdPos < 0) throw new Error('No EOCD signature found — not a valid ZIP file');

  const eocdOffset = fileSize - tailSize + eocdPos; // absolute offset in file

  let cdOff  = tail.getUint32(eocdPos + 16, true);
  let cdSize = tail.getUint32(eocdPos + 12, true);

  // If EOCD contains ZIP64 sentinels, locate the ZIP64 EOCD.
  if (cdOff === 0xFFFFFFFF || cdSize === 0xFFFFFFFF) {
    // ZIP64 EOCD locator is 20 bytes immediately before the standard EOCD.
    const locOff = eocdOffset - 20;
    if (locOff < 0) throw new Error('ZIP64 EOCD locator missing');
    const locBuf = await sliceBuffer(file, locOff, 20);
    const loc    = new DataView(locBuf);
    if (loc.getUint32(0, true) !== 0x07064b50)
      throw new Error('ZIP64 EOCD locator signature not found');
    const z64EocdOff = loc.getUint32(8, true) + loc.getUint32(12, true) * 0x100000000;
    const z64Buf = await sliceBuffer(file, z64EocdOff, 56);
    const z64    = new DataView(z64Buf);
    if (z64.getUint32(0, true) !== 0x06064b50)
      throw new Error('ZIP64 EOCD signature not found');
    cdSize = z64.getUint32(40, true) + z64.getUint32(44, true) * 0x100000000;
    cdOff  = z64.getUint32(48, true) + z64.getUint32(52, true) * 0x100000000;
  }

  // Read and parse the central directory.
  const cdBuf = await sliceBuffer(file, cdOff, cdSize);
  const cd    = new DataView(cdBuf);
  const dec   = new TextDecoder('utf-8');
  const entries = new Map(); // path → { localOff, size, flags }
  let pos = 0;

  while (pos < cdSize) {
    if (cd.getUint32(pos, true) !== 0x02014b50) break; // CD entry sig
    const flags      = cd.getUint16(pos + 8,  true);
    let   compSize   = cd.getUint32(pos + 20, true);
    let   uncomprSize= cd.getUint32(pos + 24, true);
    const nameLen    = cd.getUint16(pos + 28, true);
    const extraLen   = cd.getUint16(pos + 30, true);
    const commentLen = cd.getUint16(pos + 32, true);
    let   localOff   = cd.getUint32(pos + 42, true);

    const name = dec.decode(new Uint8Array(cdBuf, pos + 46, nameLen));

    // Parse ZIP64 extra field if any sentinel is present.
    if (compSize === 0xFFFFFFFF || uncomprSize === 0xFFFFFFFF || localOff === 0xFFFFFFFF) {
      let ep = pos + 46 + nameLen;
      const epEnd = ep + extraLen;
      while (ep < epEnd) {
        const tag     = cd.getUint16(ep, true);
        const dataLen = cd.getUint16(ep + 2, true);
        if (tag === 0x0001) {
          let dp = ep + 4;
          if (uncomprSize === 0xFFFFFFFF && dp + 8 <= epEnd) {
            uncomprSize = cd.getUint32(dp, true) + cd.getUint32(dp + 4, true) * 0x100000000;
            dp += 8;
          }
          if (compSize === 0xFFFFFFFF && dp + 8 <= epEnd) {
            compSize = cd.getUint32(dp, true) + cd.getUint32(dp + 4, true) * 0x100000000;
            dp += 8;
          }
          if (localOff === 0xFFFFFFFF && dp + 8 <= epEnd) {
            localOff = cd.getUint32(dp, true) + cd.getUint32(dp + 4, true) * 0x100000000;
          }
          break;
        }
        ep += 4 + dataLen;
      }
    }

    entries.set(name, { localOff, size: uncomprSize, compSize, compressType: cd.getUint16(pos + 10, true), flags });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

// Read a single zip entry's data bytes given its central directory info.
// Handles STORE (0) and DEFLATE (8) compression.
async function readZipEntry(file, entry) {
  // Parse local header to find exact data start (name/extra lengths can differ from CD).
  const lhBuf = await sliceBuffer(file, entry.localOff, 30);
  const lh    = new DataView(lhBuf);
  if (lh.getUint32(0, true) !== 0x04034b50)
    throw new Error(`Bad local header signature at offset ${entry.localOff}`);
  const nameLen  = lh.getUint16(26, true);
  const extraLen = lh.getUint16(28, true);
  const dataStart = entry.localOff + 30 + nameLen + extraLen;
  const compBuf   = await sliceBuffer(file, dataStart, entry.compSize);
  return entry.compressType === 8 ? inflate(compBuf) : compBuf;
}

export async function importZip(file) {
  const entries = await readZipCentral(file);

  // Locate kiosk/ prefix at any depth (mirrors serve.py logic).
  let kioskPrefix = null;
  for (const path of entries.keys()) {
    if (kioskPrefix === null) {
      const m = path.match(/^(.*?kiosk\/)/);
      if (m) { kioskPrefix = m[1]; break; }
    }
  }
  if (!kioskPrefix) throw new Error('No kiosk/ directory found in zip');

  const cards    = await importCards(entries, file, kioskPrefix);
  const branding = await importBranding(entries, file, kioskPrefix);

  const cardsWithMedia    = await Promise.all(cards.map(card => attachMediaFiles(card, entries, file, kioskPrefix)));
  const brandingWithLogos = await attachLogoFiles(branding, entries, file, kioskPrefix);
  return { cards: cardsWithMedia, branding: brandingWithLogos };
}

async function importCards(entries, file, kioskPrefix) {
  const faqPrefix = kioskPrefix + 'faqs/';
  const cards = [];

  for (const [path, entry] of entries) {
    if (!path.startsWith(faqPrefix) || !path.endsWith('.yaml')) continue;
    const buf  = await readZipEntry(file, entry);
    const text = new TextDecoder('utf-8').decode(buf);
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

async function attachMediaFiles(card, entries, file, kioskPrefix) {
  const { demo } = card;
  if (!demo) return card;
  const { type } = demo;
  const mediaPrefix = kioskPrefix + 'media/';

  if (type === 'video' || type === 'slides' || type === 'asciinema' || type === 'image-text') {
    const src      = demo.src || '';
    const filename = src.split('/').pop();
    const entry    = filename && entries.get(mediaPrefix + filename);
    if (entry) {
      demo._mediaFile = new ZipEntryFile(file, entry, filename, guessMime(filename));
    }
  } else if (type === 'video-loop' && demo.videoPaths) {
    demo._videoFiles = [];
    for (const path of demo.videoPaths) {
      const filename = path.split('/').pop();
      const entry    = filename && entries.get(mediaPrefix + filename);
      if (entry) {
        demo._videoFiles.push(new ZipEntryFile(file, entry, filename, 'video/mp4'));
      }
    }
    delete demo.videoPaths;
  }
  return card;
}

async function importBranding(entries, file, kioskPrefix) {
  const entry    = entries.get(kioskPrefix + 'branding/branding.yaml');
  const defaults = defaultBranding();
  if (!entry) return defaults;

  const buf  = await readZipEntry(file, entry);
  const text = new TextDecoder('utf-8').decode(buf);
  const data = yaml.load(text);
  if (!data) return defaults;

  const b = defaults;
  if (data.event) {
    b.event.header  = data.event.header  || b.event.header;
    b.event.tagline = data.event.tagline || b.event.tagline;
    b.event.title   = data.event.title   || b.event.title;
  }
  if (data.logos?.primary) {
    b.logos.primary._existingPath = data.logos.primary.file || null;
  }
  if (data.logos?.secondary) {
    b.logos.secondary.altText       = data.logos.secondary.alt_text || '';
    b.logos.secondary.url           = data.logos.secondary.url      || '';
    b.logos.secondary._existingPath = data.logos.secondary.file     || null;
  }
  return b;
}

async function attachLogoFiles(branding, entries, file, kioskPrefix) {
  for (const logo of [branding.logos.primary, branding.logos.secondary]) {
    if (!logo?._existingPath) continue;
    const filename = logo._existingPath.split('/').pop();
    const entry    = filename && entries.get(kioskPrefix + 'branding/' + filename);
    if (entry) logo._file = new ZipEntryFile(file, entry, filename, guessMime(filename));
  }
  return branding;
}

export function defaultBranding() {
  return {
    event: {
      header:  'Red Hat Summit',
      tagline: 'Navigate what\'s now. Unlock what\'s next.',
      title:   'Red Hat Summit - Demo Kiosk',
    },
    logos: {
      primary:   { _file: null, _existingPath: null },
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

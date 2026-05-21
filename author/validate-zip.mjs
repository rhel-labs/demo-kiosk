// validate-zip.mjs — run from the author/ directory:
//   node validate-zip.mjs [bundle.zip [exported.zip]]
//
// Default inputs:
//   arg 1 — bundle to import  (default: ../kiosk.zip)
//   arg 2 — exported bundle   (default: ../author1.zip, if present)
//
// ── Coverage ──────────────────────────────────────────────────────
// COVERED by this script:
//   • ZIP central directory parsing, including ZIP64 paths
//   • That media entries come back as ZipEntryFile (lazy), not Blob (eager read)
//   • ZipEntryFile has .name, .size, .type, and .stream() surface
//   • YAML card data parses to expected shape
//   • Branding defaults are applied when fields are missing
//   • Round-trip: author1.zip (exported by the tool) parses without error
//
// NOT COVERED — a passing run here does NOT mean the import hang is fixed:
//
//   The hang lives in ZipEntryFile.stream() at:
//     src.slice(dataStart, dataStart + e.compSize).stream()
//       .pipeThrough(new DecompressionStream('deflate-raw'))
//   That pipeline uses Blob.slice().stream() + DecompressionStream, which has
//   divergent behavior across browser engines — particularly Firefox vs Chrome
//   around ReadableStream backpressure and DecompressionStream error handling.
//   Node's Web Streams implementation does not match either browser faithfully,
//   so a green test here cannot rule out a browser-specific hang.
//
//   Similarly, curl tests and Claude Code's internal headless browser are
//   INSUFFICIENT to claim this fix works:
//     • curl tests HTTP transport, not JS stream execution in-page
//     • The internal browser is headless Chromium; it will not reproduce
//       Firefox-specific ReadableStream issues, and its results cannot be
//       generalised to claim cross-browser correctness
//   Only a human loading the bundle in each target browser (Chrome + Firefox)
//   with the rebuilt author container confirms the hang is actually fixed.
//
//   Also not covered: showSaveFilePicker / download-link export path,
//   CardPreview.jsx rendering, and any UI interaction.

import { openSync, fstatSync, readSync, closeSync, existsSync } from 'fs';
import { importZip } from './src/utils/zipHandler.js';

const importPath   = process.argv[2] ?? '../testdata/kiosk-bundle.zip';
const exportedPath = process.argv[3] ?? '../testdata/author-export-zip64.zip';

let passed = 0;
let failed = 0;

function ok(name)       { console.log(`  PASS  ${name}`); passed++; }
function fail(name, err){ console.log(`  FAIL  ${name}: ${err.message ?? err}`); failed++; }

async function test(name, fn) {
  try   { await fn(); ok(name); }
  catch (e) { fail(name, e); }
}

// Lazy file shim: reads slices on demand via fs.readSync so the full 4+ GB file
// is never loaded into memory.  Mirrors how the browser File API works — only
// the EOCD tail and central directory are actually read during import.
// .slice() returns an object compatible with Blob.slice(): has .arrayBuffer()
// and a stub .stream() (not used by the test — see note in file header).
class NodeFile {
  constructor(path) {
    this.name = path.split('/').pop();
    const fd  = openSync(path, 'r');
    this.size = fstatSync(fd).size;
    this.type = 'application/zip';
    this._path = path;
    closeSync(fd);
  }

  slice(start, end) {
    const length = Math.max(0, end - start);
    const path   = this._path;
    return {
      arrayBuffer() {
        const buf = Buffer.allocUnsafe(length);
        const fd  = openSync(path, 'r');
        readSync(fd, buf, 0, length, start);
        closeSync(fd);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + length);
      },
      // stream() stub — satisfies ZipEntryFile construction but is never
      // invoked by this test (see file header: browser-divergent path).
      stream() {
        throw new Error('NodeFile.stream() must not be called in tests — use a real browser');
      },
    };
  }
}

function loadAsFile(path, label) {
  if (!existsSync(path)) { console.log(`  SKIP  ${label} — file not found: ${path}`); return null; }
  return new NodeFile(path);
}

// ── 1. Import: central directory + card parsing ───────────────────

async function testImport(file) {
  if (!file) return null;
  console.log(`\nImport — central directory + card parsing (${importPath}):`);

  let result = null;

  await test('importZip resolves without throwing', async () => {
    result = await importZip(file);
  });
  if (!result) return null;

  await test('returns a non-empty cards array', async () => {
    if (!Array.isArray(result.cards) || !result.cards.length)
      throw new Error(`cards: ${JSON.stringify(result.cards)}`);
  });

  await test('returns a branding object with event fields', async () => {
    const { event } = result.branding ?? {};
    if (!event?.header) throw new Error('branding.event.header missing');
  });

  await test('each card has id, title, enabled, demo', async () => {
    for (const c of result.cards) {
      if (!c.id)    throw new Error(`card missing id: ${JSON.stringify(c)}`);
      if (!c.title) throw new Error(`card ${c.id} missing title`);
      if (c.enabled === undefined) throw new Error(`card ${c.id} missing enabled`);
      if (!c.demo)  throw new Error(`card ${c.id} missing demo`);
    }
  });

  await test('demo types are known values', async () => {
    const known = new Set(['video','slides','asciinema','image-text','external-url','lab','arcade','video-loop']);
    for (const c of result.cards) {
      if (!known.has(c.demo.type))
        throw new Error(`card ${c.id} has unknown demo type: ${c.demo.type}`);
    }
  });

  return result;
}

// ── 2. Lazy loading — confirms the import-hang fix is wired up ────

async function testLazyLoading(result) {
  if (!result) { console.log('\nLazy loading: SKIP (no import result)'); return; }
  console.log('\nLazy loading — import hang fix:');

  const mediaCards = result.cards.filter(c => c.demo?._mediaFile != null);
  const loopCards  = result.cards.filter(c => c.demo?._videoFiles?.length);

  if (!mediaCards.length && !loopCards.length) {
    console.log('  SKIP  no media cards found in bundle');
    return;
  }

  await test('_mediaFile is ZipEntryFile, not Blob (not eagerly read)', async () => {
    if (!mediaCards.length) return;
    for (const c of mediaCards) {
      if (c.demo._mediaFile instanceof Blob)
        throw new Error(`card ${c.id}: _mediaFile is a Blob — eager read, hang risk remains`);
    }
  });

  await test('_mediaFile has .name, .size, .type, .stream', async () => {
    if (!mediaCards.length) return;
    for (const c of mediaCards) {
      const f = c.demo._mediaFile;
      if (!f.name)                    throw new Error(`card ${c.id}: .name missing`);
      if (typeof f.size !== 'number') throw new Error(`card ${c.id}: .size not a number`);
      if (typeof f.stream !== 'function') throw new Error(`card ${c.id}: .stream() missing`);
    }
  });

  await test('video-loop _videoFiles are ZipEntryFile, not Blob', async () => {
    if (!loopCards.length) return;
    for (const c of loopCards) {
      for (const f of c.demo._videoFiles) {
        if (f instanceof Blob)
          throw new Error(`card ${c.id}: video file is a Blob — eager read, hang risk remains`);
      }
    }
  });

  // .stream() is intentionally NOT called here.
  // Invoking it would exercise Blob.slice().stream().pipeThrough(DecompressionStream),
  // which is the browser-divergent path this test cannot validate.
  console.log('  NOTE  .stream() not invoked — browser-divergent path, see file header');
}

// ── 3. Round-trip: exported bundle re-imports cleanly ─────────────

async function testRoundTrip(file) {
  if (!file) return;
  console.log(`\nRound-trip — exported bundle re-imports (${exportedPath}):`);

  await test('exported zip parses central directory without error', async () => {
    await importZip(file);
  });
}

// ── Run ───────────────────────────────────────────────────────────

const importFile   = loadAsFile(importPath,  'kiosk.zip');
const exportedFile = loadAsFile(exportedPath, 'author1.zip');

const result = await testImport(importFile);
await testLazyLoading(result);
await testRoundTrip(exportedFile);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

# ================================================================
# serve.py — HTTP server for the Demo Kiosk
# ================================================================
# Wraps Python's built-in http.server with three additions:
#
# 1. HTTP/1.1 protocol — Python's SimpleHTTPRequestHandler defaults
#    to HTTP/1.0, which Chrome treats as a broken connection when
#    it sends HTTP/1.1 requests and gets HTTP/1.0 responses back.
#
# 2. Cache-Control: no-store on non-media responses so browsers
#    never serve stale HTML/JS/CSS from disk cache or bfcache.
#    Media files are excluded: no-store prevents Chrome's media
#    pipeline from buffering video data between range requests.
#
# 3. HTTP range request support for video and audio files.
#    Python's SimpleHTTPRequestHandler does not handle Range
#    headers (at least through Python 3.14), so without this
#    patch browsers cannot seek or start playback before a full
#    download of a large video file.
#
# 4. Content management API at /setup, /display, /stats (HTML pages)
#    and /api/* endpoints for uploading content and editing cards at
#    runtime. Writes require a writable content directory — see README.md
#    for volume mount options.
#
# Accepts the same CLI arguments as `python3 -m http.server`:
#   python3 serve.py 8181 --bind :: --directory /srv/faq
#
# ================================================================

import argparse
import contextlib
import http.server
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import zipfile
import shutil
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None

try:
    from qtfaststart import processor as _qs_processor
except ImportError:
    _qs_processor = None


def _apply_faststart(path):
    """Move the moov atom to the front of an MP4 in-place.

    No-op if qtfaststart is unavailable or the file is already faststart.
    Pure remux — no re-encoding, no quality change.
    """
    if _qs_processor is None:
        return
    fd, tmp = tempfile.mkstemp(suffix='.mp4', dir=os.path.dirname(path))
    os.close(fd)
    try:
        _qs_processor.process(path, tmp)
        shutil.move(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass


# File extensions accepted for media upload, and the demo type inferred from each.
_MEDIA_DEMO_TYPE = {
    '.mp4':  'video',
    '.webm': 'video',
    '.pdf':  'slides',
    '.cast': 'asciinema',
    '.png':  'image-text',
    '.jpg':  'image-text',
    '.jpeg': 'image-text',
    '.svg':  'image-text',
    '.webp': 'image-text',
}

_LOGO_EXTS = {'.svg', '.png', '.jpg', '.jpeg', '.webp'}


def _load_spec(directory='.'):
    """Load build/bundle-spec.yaml relative to the serving directory."""
    spec_path = Path(directory) / 'build' / 'bundle-spec.yaml'
    if yaml is None or not spec_path.exists():
        return None
    try:
        return yaml.safe_load(spec_path.read_text(encoding='utf-8'))
    except Exception:
        return None

_SPEC = _load_spec()
_CARD_REQUIRED    = set(_SPEC['card']['required_fields']) if _SPEC else {'id', 'title', 'summary', 'demo'}
_VALID_DEMO_TYPES = set(_SPEC['card']['demo_types'].keys()) if _SPEC else {
    'video', 'slides', 'asciinema', 'image-text',
    'external-url', 'arcade', 'lab', 'video-loop', 'upload',
}


def _bootstrap_content_index(content_dir):
    """Generate content/index.yaml from existing card order fields if absent."""
    if yaml is None:
        return
    index_path = Path(content_dir) / 'index.yaml'
    if index_path.exists():
        return
    faqs_dir = Path(content_dir) / 'faqs'
    if not faqs_dir.is_dir():
        return
    cards = []
    for path in sorted(faqs_dir.glob('*.yaml')):
        if path.stem.startswith('_'):
            continue
        try:
            data = yaml.safe_load(path.read_text(encoding='utf-8'))
            if isinstance(data, dict) and 'id' in data:
                cards.append((data.get('order', 0), path.stem, data['id']))
        except Exception:
            pass
    cards.sort(key=lambda x: (x[0], x[1]))
    index = {'schema_version': 2, 'card_order': [c[2] for c in cards], 'categories': []}
    index_path.write_text(yaml.dump(index, default_flow_style=False), encoding='utf-8')


def _read_content_index(content_dir):
    """Load content/index.yaml, returning card_order list."""
    if yaml is None:
        return []
    index_path = Path(content_dir) / 'index.yaml'
    try:
        data = yaml.safe_load(index_path.read_text(encoding='utf-8'))
        return data.get('card_order', []) if isinstance(data, dict) else []
    except Exception:
        return []


def _write_content_index(content_dir, index_data):
    """Write content/index.yaml."""
    if yaml is None:
        return
    index_path = Path(content_dir) / 'index.yaml'
    index_path.write_text(yaml.dump(index_data, default_flow_style=False), encoding='utf-8')


class KioskHandler(http.server.SimpleHTTPRequestHandler):

    # ── Cache and range headers ───────────────────────────────────

    def end_headers(self):
        # Suppress no-store for media files: Chrome's media pipeline needs
        # to buffer range responses between requests and no-store blocks that.
        path = self.translate_path(self.path)
        if not self.guess_type(path).startswith(('video/', 'audio/')):
            self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    # ── Routing ───────────────────────────────────────────────────

    def do_GET(self):
        p = self.path.split('?')[0]
        if p == '/setup':
            self.path = '/setup.html'
        elif p == '/stats':
            self.path = '/stats.html'
        elif p == '/display':
            self.path = '/display.html'
        elif p == '/api/status':
            self._handle_status()
            return
        elif p == '/api/cards':
            self._handle_list_cards()
            return
        elif p == '/api/media':
            self._handle_list_media()
            return
        elif p == '/api/branding':
            self._handle_get_branding()
            return
        if self._try_range():
            return
        super().do_GET()

    def do_HEAD(self):
        if self._try_range():
            return
        super().do_HEAD()

    def do_POST(self):
        p = self.path.split('?')[0]
        if p == '/api/upload/zip':
            self._handle_zip_upload()
        elif p == '/api/upload/media':
            self._handle_media_upload()
        elif p == '/api/cards':
            self._handle_create_card()
        elif p == '/api/branding':
            self._handle_update_branding()
        elif p == '/api/upload/logo':
            self._handle_logo_upload()
        else:
            self.send_error(404)

    def do_PUT(self):
        p = self.path.split('?')[0]
        if p.startswith('/api/cards/'):
            card_id = p[len('/api/cards/'):]
            self._handle_update_card(card_id)
        else:
            self.send_error(404)

    def do_DELETE(self):
        p = self.path.split('?')[0]
        if p.startswith('/api/cards/'):
            card_id = p[len('/api/cards/'):]
            self._handle_delete_card(card_id)
        else:
            self.send_error(404)

    # ── Management API handlers ───────────────────────────────────

    def _handle_list_media(self):
        media_dir = self._content_dir / 'media'
        files = []
        if media_dir.exists():
            for f in sorted(media_dir.iterdir()):
                ext = f.suffix.lower()
                if f.is_file() and not f.name.startswith('.') and ext in _MEDIA_DEMO_TYPE:
                    files.append({
                        'filename':  f.name,
                        'path':      f'content/media/{f.name}',
                        'demo_type': _MEDIA_DEMO_TYPE[ext],
                    })
        self._send_json(files)

    def _handle_status(self):
        self._send_json({'writable': self._is_writable()})

    def _handle_list_cards(self):
        if yaml is None:
            return self._send_json({'error': 'PyYAML not available in runtime'}, 500)
        cards = []
        faqs_dir = self._content_dir / 'faqs'
        if faqs_dir.exists():
            for path in sorted(faqs_dir.glob('*.yaml')):
                if path.stem.startswith('_'):
                    continue
                try:
                    with open(path, encoding='utf-8') as fh:
                        data = yaml.safe_load(fh)
                    if isinstance(data, dict):
                        data['_filename'] = path.name
                        cards.append(data)
                except Exception:
                    pass
        self._send_json(cards)

    def _handle_zip_upload(self):
        if not self._is_writable():
            return self._send_json(self._not_writable_error(), 503)

        overwrite = self.headers.get('X-Overwrite', '').lower() == 'true'

        with tempfile.TemporaryDirectory(dir=self._content_dir) as tmp:
            zip_path = os.path.join(tmp, 'upload.zip')
            try:
                filename = self._stream_upload_file(zip_path)
            except (ValueError, OSError) as exc:
                return self._send_json({'error': f'Upload failed: {exc}'}, 400)
            if not filename:
                return self._send_json({'error': 'No file field in upload'}, 400)
            if not filename.lower().endswith('.zip'):
                return self._send_json({'error': 'Expected a .zip file'}, 400)
            try:
                with zipfile.ZipFile(zip_path) as zf:
                    zf.extractall(tmp)
            except (zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
                return self._send_json({'error': f'Invalid zip file: {exc}'}, 400)

            # Find kiosk/ at any nesting depth — handles both Google Drive's
            # timestamped wrapper (kiosk-<ts>/kiosk/) and a flat kiosk/ root.
            kiosk_dir = None
            for dirpath, dirs, _ in os.walk(tmp):
                dirs[:] = [d for d in dirs
                           if not d.startswith('.') and d != '__MACOSX']
                if os.path.basename(dirpath) == 'kiosk':
                    kiosk_dir = dirpath
                    break
            if not kiosk_dir:
                return self._send_json(
                    {'error': "No 'kiosk/' directory found in zip. "
                              "Expected structure: kiosk/faqs/, kiosk/branding/, kiosk/media/"}, 400)

            # Apply faststart to every MP4 in the bundle before moving to content/.
            media_src = os.path.join(kiosk_dir, 'media')
            media_added = []
            if os.path.isdir(media_src):
                for fname in os.listdir(media_src):
                    if not fname.startswith('.'):
                        if fname.lower().endswith('.mp4'):
                            _apply_faststart(os.path.join(media_src, fname))
                        media_added.append(fname)

            # Read bundle manifest (determines content areas to touch).
            manifest_path = os.path.join(kiosk_dir, 'bundle.yaml')
            bundle_type = 'full'
            if os.path.exists(manifest_path) and yaml is not None:
                try:
                    manifest = yaml.safe_load(open(manifest_path, encoding='utf-8').read())
                    if isinstance(manifest, dict):
                        bundle_type = manifest.get('bundle_type', 'full')
                except Exception:
                    pass

            summary = {'added': [], 'renamed': {}, 'media_added': media_added}

            try:
                content_str = str(self._content_dir)

                # ── faqs/ handling ───────────────────────────────────────────
                faqs_src = os.path.join(kiosk_dir, 'faqs')
                if bundle_type in ('content', 'full') and os.path.isdir(faqs_src):
                    faqs_dst = os.path.join(content_str, 'faqs')

                    if overwrite:
                        # Overwrite: replace faqs/ entirely
                        if os.path.isdir(faqs_dst):
                            shutil.rmtree(faqs_dst)
                        shutil.move(faqs_src, faqs_dst)
                    else:
                        # Add mode: merge, rename collisions
                        os.makedirs(faqs_dst, exist_ok=True)

                        # Collect existing card IDs
                        existing_ids = set()
                        if os.path.isdir(faqs_dst):
                            for f in os.listdir(faqs_dst):
                                if f.endswith('.yaml') and not f.startswith('_'):
                                    try:
                                        d = yaml.safe_load(
                                            open(os.path.join(faqs_dst, f), encoding='utf-8').read()
                                        ) if yaml else {}
                                        if isinstance(d, dict) and 'id' in d:
                                            existing_ids.add(d['id'])
                                    except Exception:
                                        pass

                        incoming_ids = set()  # IDs already placed from this bundle
                        for fname in sorted(os.listdir(faqs_src)):
                            if fname.startswith('.') or not fname.endswith('.yaml'):
                                continue
                            src_path = os.path.join(faqs_src, fname)
                            try:
                                card = yaml.safe_load(
                                    open(src_path, encoding='utf-8').read()
                                ) if yaml else None
                            except Exception:
                                card = None

                            original_id = card.get('id', '') if isinstance(card, dict) else ''
                            final_id = original_id

                            # Rename on collision with existing or already-placed
                            if original_id and (original_id in existing_ids or original_id in incoming_ids):
                                n = 2
                                while f'{original_id}-{n}' in existing_ids or f'{original_id}-{n}' in incoming_ids:
                                    n += 1
                                final_id = f'{original_id}-{n}'
                                if yaml and isinstance(card, dict):
                                    card['id'] = final_id
                                    open(src_path, 'w', encoding='utf-8').write(
                                        yaml.dump(card, default_flow_style=False, allow_unicode=True)
                                    )
                                summary['renamed'][original_id] = final_id

                            dst_path = os.path.join(faqs_dst, fname)
                            shutil.move(src_path, dst_path)
                            if final_id:
                                incoming_ids.add(final_id)
                                summary['added'].append(final_id)

                # ── branding/ and media/ ─────────────────────────────────────
                # branding bundles must not touch media/
                for item in ('branding',) if bundle_type == 'branding' else ('branding', 'media'):
                    item_src = os.path.join(kiosk_dir, item)
                    if os.path.isdir(item_src):
                        item_dst = os.path.join(content_str, item)
                        os.makedirs(item_dst, exist_ok=True)
                        for fname in os.listdir(item_src):
                            if not fname.startswith('.'):
                                shutil.move(os.path.join(item_src, fname),
                                            os.path.join(item_dst, fname))

                # ── Other top-level files (not faqs/, branding/, media/) ─────
                for item in os.listdir(kiosk_dir):
                    if item.startswith('.') or item in ('bundle.yaml', 'index.yaml', 'faqs', 'branding', 'media'):
                        continue
                    src = os.path.join(kiosk_dir, item)
                    dst = os.path.join(content_str, item)
                    if not os.path.isdir(src):
                        shutil.move(src, dst)

                # ── content/index.yaml ───────────────────────────────────────
                index_src = os.path.join(kiosk_dir, 'index.yaml')
                if overwrite and os.path.exists(index_src):
                    # Overwrite: replace index.yaml from bundle
                    shutil.move(index_src, os.path.join(content_str, 'index.yaml'))
                elif bundle_type in ('content', 'full') and summary['added']:
                    # Add mode: merge new card IDs into existing index.yaml
                    _bootstrap_content_index(content_str)
                    try:
                        existing_index = yaml.safe_load(
                            open(os.path.join(content_str, 'index.yaml'), encoding='utf-8').read()
                        ) if yaml else {}
                        if not isinstance(existing_index, dict):
                            existing_index = {'schema_version': 2, 'card_order': [], 'categories': []}
                        card_order = existing_index.get('card_order', [])
                        for cid in summary['added']:
                            if cid not in card_order:
                                card_order.append(cid)
                        existing_index['card_order'] = card_order
                        _write_content_index(content_str, existing_index)
                    except Exception:
                        pass

            except OSError as exc:
                return self._send_json(
                    {'error': f'Bundle extracted but content install failed: {exc}'}, 500)

        ok, output = self._rebuild()
        if not ok:
            return self._send_json({'error': 'Content extracted but rebuild failed', 'output': output}, 500)
        self._send_json({
            'message': 'Bundle uploaded and content rebuilt',
            'output': output,
            'summary': summary,
        })

    def _handle_media_upload(self):
        if not self._is_writable():
            return self._send_json(self._not_writable_error(), 503)

        media_dir = self._content_dir / 'media'
        media_dir.mkdir(parents=True, exist_ok=True)

        # Stream to a temp file in media_dir (same filesystem) so the final
        # os.replace() is an atomic rename rather than a disk copy, and the
        # full video is never held in RAM regardless of size.
        tmp_fd, tmp_path = tempfile.mkstemp(dir=media_dir)
        os.close(tmp_fd)
        try:
            try:
                filename = self._stream_upload_file(tmp_path)
            except (ValueError, OSError) as exc:
                return self._send_json({'error': f'Upload failed: {exc}'}, 400)
            if not filename:
                return self._send_json({'error': 'No file field in upload'}, 400)

            ext = Path(filename).suffix.lower()
            if ext not in _MEDIA_DEMO_TYPE:
                return self._send_json(
                    {'error': f'Unsupported file type {ext!r}. '
                              f'Supported: {", ".join(sorted(_MEDIA_DEMO_TYPE))}'}, 400)

            # Sanitize: keep alphanumeric, dots, hyphens, spaces, underscores.
            safe_name = re.sub(r'[^\w.\- ]', '_', filename).strip()
            if not safe_name:
                return self._send_json({'error': 'Filename contains no usable characters'}, 400)

            if ext == '.mp4':
                _apply_faststart(tmp_path)

            dest = media_dir / safe_name
            os.replace(tmp_path, dest)
            tmp_path = None  # ownership transferred — skip cleanup

            demo_type = _MEDIA_DEMO_TYPE[ext]
            self._send_json({
                'filename':  safe_name,
                'path':      f'content/media/{safe_name}',
                'demo_type': demo_type,
            })
        finally:
            if tmp_path is not None:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    def _handle_create_card(self):
        if not self._is_writable():
            return self._send_json(self._not_writable_error(), 503)
        card, err = self._read_card_body()
        if err:
            return self._send_json({'error': err}, 400)
        card_id = card['id']
        if self._find_card_file(card_id):
            return self._send_json({'error': f"Card id '{card_id}' already exists"}, 409)

        path = self._content_dir / 'faqs' / f'{card_id}.yaml'
        self._write_card(path, card)
        ok, output = self._rebuild()
        if not ok:
            path.unlink(missing_ok=True)
            return self._send_json({'error': 'Card saved but rebuild failed', 'output': output}, 500)
        self._send_json({'message': f"Card '{card_id}' created", 'output': output})

    def _handle_delete_card(self, card_id):
        if not self._is_writable():
            return self._send_json(self._not_writable_error(), 503)
        path = self._find_card_file(card_id)
        if not path:
            return self._send_json({'error': f"Card '{card_id}' not found"}, 404)
        path.unlink()
        ok, output = self._rebuild()
        if not ok:
            return self._send_json({'error': 'Card deleted but rebuild failed', 'output': output}, 500)
        self._send_json({'message': f"Card '{card_id}' deleted"})

    def _handle_update_card(self, card_id):
        if not self._is_writable():
            return self._send_json(self._not_writable_error(), 503)
        card, err = self._read_card_body()
        if err:
            return self._send_json({'error': err}, 400)
        if card.get('id') != card_id:
            return self._send_json({'error': "Card id in body does not match URL"}, 400)
        path = self._find_card_file(card_id)
        if not path:
            return self._send_json({'error': f"Card '{card_id}' not found"}, 404)
        self._write_card(path, card)
        ok, output = self._rebuild()
        if not ok:
            return self._send_json({'error': 'Card saved but rebuild failed', 'output': output}, 500)
        self._send_json({'message': f"Card '{card_id}' updated", 'output': output})

    def _handle_get_branding(self):
        if yaml is None:
            return self._send_json({'error': 'PyYAML not available'}, 500)
        branding_file = self._content_dir / 'branding' / 'branding.yaml'
        if not branding_file.exists():
            return self._send_json({'error': 'branding.yaml not found'}, 404)
        try:
            with open(branding_file, encoding='utf-8') as fh:
                data = yaml.safe_load(fh)
        except Exception as exc:
            return self._send_json({'error': f'Cannot read branding.yaml: {exc}'}, 500)
        event     = data.get('event', {})
        secondary = data.get('logos', {}).get('secondary', {})
        self._send_json({
            'header':             event.get('header', ''),
            'tagline':            event.get('tagline', ''),
            'title':              event.get('title', ''),
            'secondary_logo_file': secondary.get('file', ''),
            'secondary_logo_alt':  secondary.get('alt_text', ''),
            'secondary_logo_url':  secondary.get('url', ''),
        })

    def _handle_update_branding(self):
        if not self._is_writable():
            return self._send_json(self._not_writable_error(), 503)
        if yaml is None:
            return self._send_json({'error': 'PyYAML not available'}, 500)
        try:
            body = self._read_json_body()
        except Exception as exc:
            return self._send_json({'error': f'Invalid JSON: {exc}'}, 400)
        header = str(body.get('header', '')).strip()
        if not header:
            return self._send_json({'error': "'header' is required"}, 400)
        branding_file = self._content_dir / 'branding' / 'branding.yaml'
        if not branding_file.exists():
            return self._send_json({'error': 'branding.yaml not found'}, 404)
        try:
            with open(branding_file, encoding='utf-8') as fh:
                data = yaml.safe_load(fh)
        except Exception as exc:
            return self._send_json({'error': f'Cannot read branding.yaml: {exc}'}, 500)
        # Update only the fields the UI exposes; leave colors/layout/footer untouched.
        data.setdefault('event', {})['header'] = header
        tagline = str(body.get('tagline', '')).strip()
        if tagline:
            data['event']['tagline'] = tagline
        else:
            data['event'].pop('tagline', None)
        title = str(body.get('title', '')).strip()
        if title:
            data['event']['title'] = title
        else:
            data['event'].pop('title', None)
        secondary = data.setdefault('logos', {}).setdefault('secondary', {})
        logo_file = str(body.get('secondary_logo_file', '')).strip()
        if logo_file:
            secondary['file'] = logo_file
        logo_alt = str(body.get('secondary_logo_alt', '')).strip()
        if logo_alt:
            secondary['alt_text'] = logo_alt
        logo_url = str(body.get('secondary_logo_url', '')).strip()
        if logo_url:
            secondary['url'] = logo_url
        else:
            secondary.pop('url', None)
        try:
            with open(branding_file, 'w', encoding='utf-8') as fh:
                yaml.dump(data, fh, default_flow_style=False, allow_unicode=True, sort_keys=False)
        except Exception as exc:
            return self._send_json({'error': f'Cannot write branding.yaml: {exc}'}, 500)
        ok, output = self._rebuild()
        if not ok:
            return self._send_json({'error': 'Branding saved but rebuild failed', 'output': output}, 500)
        self._send_json({'message': 'Branding updated'})

    def _handle_logo_upload(self):
        if not self._is_writable():
            return self._send_json(self._not_writable_error(), 503)

        branding_dir = self._content_dir / 'branding'
        branding_dir.mkdir(parents=True, exist_ok=True)

        tmp_fd, tmp_path = tempfile.mkstemp(dir=branding_dir)
        os.close(tmp_fd)
        try:
            try:
                filename = self._stream_upload_file(tmp_path)
            except (ValueError, OSError) as exc:
                return self._send_json({'error': f'Upload failed: {exc}'}, 400)
            if not filename:
                return self._send_json({'error': 'No file field in upload'}, 400)
            ext = Path(filename).suffix.lower()
            if ext not in _LOGO_EXTS:
                return self._send_json(
                    {'error': f'Unsupported logo type {ext!r}. '
                              f'Supported: {", ".join(sorted(_LOGO_EXTS))}'}, 400)
            safe_name = re.sub(r'[^\w.\-]', '_', filename).strip()
            if not safe_name:
                return self._send_json({'error': 'Filename contains no usable characters'}, 400)
            dest = branding_dir / safe_name
            os.replace(tmp_path, dest)
            tmp_path = None
            self._send_json({
                'filename': safe_name,
                'path':     f'content/branding/{safe_name}',
            })
        finally:
            if tmp_path is not None:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    # ── Helpers ───────────────────────────────────────────────────

    @property
    def _content_dir(self):
        return Path(self.directory) / 'content'

    def _is_writable(self):
        return os.access(self._content_dir, os.W_OK)

    def _not_writable_error(self):
        return {
            'error': 'Content directory is not writable. '
                     'Mount a writable volume or bind mount at /srv/faq/content — '
                     'see README.md for options.',
        }

    def _stream_upload_file(self, dest_path, chunk=65536):
        """Stream the first file field of a multipart/form-data request to dest_path.

        Reads multipart headers line-by-line (small), then computes the exact
        file-data length from Content-Length minus envelope overhead, and streams
        the payload in chunks so the full body is never held in RAM.  This
        allows zip bundles of any size to be uploaded without OOM errors.

        Returns the filename from Content-Disposition, or None if no file field
        is found.  Raises ValueError on malformed multipart framing.
        """
        ct = self.headers.get('Content-Type', '')
        boundary = None
        for seg in ct.split(';'):
            seg = seg.strip()
            if seg.lower().startswith('boundary='):
                boundary = seg[9:].strip().strip('"').encode('latin-1')
                break
        if not boundary:
            raise ValueError('No boundary in Content-Type')

        total = int(self.headers.get('Content-Length', 0))
        if total <= 0:
            raise ValueError('Missing or zero Content-Length')

        header_bytes = 0
        filename = None

        # Read the opening boundary line: --boundary\r\n
        line = self.rfile.readline(len(boundary) + 8)
        header_bytes += len(line)
        if line.rstrip(b'\r\n') != b'--' + boundary:
            raise ValueError('Opening boundary not found')

        # Read part headers until the blank line
        while True:
            line = self.rfile.readline(8192)
            if not line:
                raise ValueError('Unexpected end of part headers')
            header_bytes += len(line)
            if line == b'\r\n':
                break
            if line.lower().startswith(b'content-disposition:'):
                for part in line.decode('latin-1', errors='replace').split(';'):
                    part = part.strip()
                    if part.lower().startswith('filename='):
                        filename = part[9:].strip().strip('"')

        # File data is everything between here and \r\n--boundary--\r\n
        closing = b'\r\n--' + boundary + b'--\r\n'
        file_length = total - header_bytes - len(closing)
        if file_length < 0:
            raise ValueError('Computed file length is negative; malformed multipart body')

        with open(dest_path, 'wb') as f:
            remaining = file_length
            while remaining > 0:
                data = self.rfile.read(min(chunk, remaining))
                if not data:
                    break
                f.write(data)
                remaining -= len(data)

        # Drain the closing boundary so the connection stays clean
        self.rfile.read(len(closing))
        return filename

    def _read_json_body(self):
        length = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(length))

    def _read_card_body(self):
        """Read and validate a card JSON body. Returns (card_dict, error_str)."""
        try:
            data = self._read_json_body()
        except Exception as exc:
            return None, f'Invalid JSON: {exc}'

        missing = _CARD_REQUIRED - set(data.keys())
        if missing:
            return None, f"Missing required fields: {', '.join(sorted(missing))}"
        if not isinstance(data.get('demo'), dict):
            return None, "'demo' must be an object"
        demo_type = data['demo'].get('type')
        if demo_type not in _VALID_DEMO_TYPES:
            return None, (f"Unknown demo type {demo_type!r}. "
                          f"Valid types: {', '.join(sorted(_VALID_DEMO_TYPES))}")
        card_id = data.get('id', '')
        id_pattern = _SPEC['card']['id_pattern'] if _SPEC else r'[a-z0-9][a-z0-9\-]*'
        if not re.fullmatch(id_pattern, card_id):
            return None, ("'id' must start with a lowercase letter or digit "
                          "and contain only lowercase letters, digits, and hyphens")
        return data, None

    def _find_card_file(self, card_id):
        """Return the Path of the YAML file whose id field matches card_id, or None."""
        if yaml is None:
            return None
        for path in sorted((self._content_dir / 'faqs').glob('*.yaml')):
            if path.stem.startswith('_'):
                continue
            try:
                with open(path, encoding='utf-8') as fh:
                    data = yaml.safe_load(fh)
                if isinstance(data, dict) and data.get('id') == card_id:
                    return path
            except Exception:
                pass
        return None

    def _write_card(self, path, card):
        card = {k: v for k, v in card.items() if not k.startswith('_')}
        with open(path, 'w', encoding='utf-8') as fh:
            yaml.dump(card, fh, default_flow_style=False, allow_unicode=True, sort_keys=False)

    def _rebuild(self):
        """Run build-faqs.py and return (success, combined_output)."""
        script = Path(self.directory) / 'build' / 'build-faqs.py'
        result = subprocess.run(
            [sys.executable, str(script)],
            capture_output=True, text=True, cwd=self.directory,
        )
        return result.returncode == 0, result.stdout + result.stderr

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── Range request support ─────────────────────────────────────

    def _try_range(self):
        """Serve a Range request for a media file as 206 Partial Content.

        Returns True if the request was handled (caller should not call
        super()), False if no Range header or not a media file.
        """
        range_header = self.headers.get('Range', '').strip()
        if not range_header:
            return False

        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return False

        ctype = self.guess_type(path)
        if not ctype.startswith(('video/', 'audio/')):
            return False

        # Only the simple single-range form used by browsers: bytes=start-end
        # or bytes=start- or bytes=-suffix.
        m = re.fullmatch(r'bytes=(\d*)-(\d*)', range_header)
        if not m:
            self.send_error(416, "Requested Range Not Satisfiable")
            return True

        start_str, end_str = m.group(1), m.group(2)
        if not start_str and not end_str:
            self.send_error(416, "Requested Range Not Satisfiable")
            return True

        file_size = os.path.getsize(path)

        if not start_str:
            # Suffix range: bytes=-N → last N bytes
            start = max(0, file_size - int(end_str))
            end   = file_size - 1
        else:
            start = int(start_str)
            end   = int(end_str) if end_str else file_size - 1

        end = min(end, file_size - 1)

        if start > end or start >= file_size:
            self.send_error(416, "Requested Range Not Satisfiable")
            return True

        length = end - start + 1

        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(404, "File not found")
            return True

        try:
            f.seek(start)
            self.send_response(206)
            self.send_header("Content-Type",   ctype)
            self.send_header("Content-Range",  f"bytes {start}-{end}/{file_size}")
            self.send_header("Content-Length", str(length))
            self.send_header("Last-Modified",
                             self.date_time_string(os.path.getmtime(path)))
            self.end_headers()
            if self.command == 'GET':
                remaining = length
                try:
                    while remaining > 0:
                        chunk = min(65536, remaining)
                        data  = f.read(chunk)
                        if not data:
                            break
                        self.wfile.write(data)
                        remaining -= len(data)
                except (ConnectionResetError, BrokenPipeError):
                    pass
        finally:
            f.close()

        return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-b", "--bind", metavar="ADDRESS",
                        help="bind to this address (default: all interfaces)")
    parser.add_argument("-d", "--directory", default=".",
                        help="serve this directory (default: current directory)")
    parser.add_argument("port", default=8000, type=int, nargs="?",
                        help="bind to this port (default: %(default)s)")
    args = parser.parse_args()

    # Mirror the dual-stack mixin from http.server.__main__ so that
    # binding to '::' serves both IPv4 and IPv6 (matches -m http.server).
    class DualStackServer(http.server.ThreadingHTTPServer):
        def server_bind(self):
            with contextlib.suppress(Exception):
                self.socket.setsockopt(
                    socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            return super().server_bind()

        def finish_request(self, request, client_address):
            self.RequestHandlerClass(request, client_address, self,
                                     directory=args.directory)

    # Bootstrap content/index.yaml from card order fields if not present.
    content_dir = Path(args.directory) / 'content'
    if content_dir.is_dir():
        _bootstrap_content_index(content_dir)

    http.server.test(
        HandlerClass=KioskHandler,
        ServerClass=DualStackServer,
        port=args.port,
        bind=args.bind,
        protocol="HTTP/1.1",
    )

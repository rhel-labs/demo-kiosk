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
# 4. Content management API at /manage (HTML page) and /api/*
#    endpoints for uploading content and editing cards at runtime.
#    Writes require a writable content directory — see README.md
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

_CARD_REQUIRED     = {'id', 'order', 'title', 'summary', 'demo'}
_VALID_DEMO_TYPES  = {
    'video', 'slides', 'asciinema', 'image-text',
    'external-url', 'arcade', 'lab', 'video-loop',
}


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
        if p == '/manage':
            # Rewrite to the static file; SimpleHTTPRequestHandler serves it.
            self.path = '/manage.html'
        elif p == '/api/status':
            self._handle_status()
            return
        elif p == '/api/cards':
            self._handle_list_cards()
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
        else:
            self.send_error(404)

    def do_PUT(self):
        p = self.path.split('?')[0]
        if p.startswith('/api/cards/'):
            card_id = p[len('/api/cards/'):]
            self._handle_update_card(card_id)
        else:
            self.send_error(404)

    # ── Management API handlers ───────────────────────────────────

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
        parts = self._read_multipart()
        if 'file' not in parts:
            return self._send_json({'error': 'No file field in upload'}, 400)
        file_data = parts['file']['data']
        filename  = parts['file']['filename']
        if not filename.lower().endswith('.zip'):
            return self._send_json({'error': 'Expected a .zip file'}, 400)

        with tempfile.TemporaryDirectory() as tmp:
            zip_path = os.path.join(tmp, 'upload.zip')
            with open(zip_path, 'wb') as f:
                f.write(file_data)
            try:
                with zipfile.ZipFile(zip_path) as zf:
                    zf.extractall(tmp)
            except zipfile.BadZipFile as exc:
                return self._send_json({'error': f'Invalid zip file: {exc}'}, 400)

            # Find kiosk/ at any nesting depth — handles both Google Drive's
            # timestamped wrapper (kiosk-<ts>/kiosk/) and a flat kiosk/ root.
            kiosk_dir = None
            for dirpath, dirs, _ in os.walk(tmp):
                if os.path.basename(dirpath) == 'kiosk':
                    kiosk_dir = dirpath
                    break
            if not kiosk_dir:
                return self._send_json(
                    {'error': "No 'kiosk/' directory found in zip. "
                              "Expected structure: kiosk/faqs/, kiosk/branding/, kiosk/media/"}, 400)

            content_str = str(self._content_dir)
            for item in os.listdir(kiosk_dir):
                src = os.path.join(kiosk_dir, item)
                dst = os.path.join(content_str, item)
                if os.path.isdir(src):
                    shutil.copytree(src, dst, dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)

        ok, output = self._rebuild()
        if not ok:
            return self._send_json({'error': 'Content extracted but rebuild failed', 'output': output}, 500)
        self._send_json({'message': 'Bundle uploaded and content rebuilt', 'output': output})

    def _handle_media_upload(self):
        if not self._is_writable():
            return self._send_json(self._not_writable_error(), 503)
        parts = self._read_multipart()
        if 'file' not in parts:
            return self._send_json({'error': 'No file field in upload'}, 400)
        file_data = parts['file']['data']
        filename  = parts['file']['filename']
        if not filename:
            return self._send_json({'error': 'No filename in upload'}, 400)

        ext = Path(filename).suffix.lower()
        if ext not in _MEDIA_DEMO_TYPE:
            return self._send_json(
                {'error': f'Unsupported file type {ext!r}. '
                          f'Supported: {", ".join(sorted(_MEDIA_DEMO_TYPE))}'}, 400)

        # Sanitize: keep alphanumeric, dots, hyphens, spaces, underscores.
        safe_name = re.sub(r'[^\w.\- ]', '_', filename).strip()
        if not safe_name:
            return self._send_json({'error': 'Filename contains no usable characters'}, 400)

        media_dir = self._content_dir / 'media'
        media_dir.mkdir(parents=True, exist_ok=True)
        dest = media_dir / safe_name
        with open(dest, 'wb') as f:
            f.write(file_data)

        demo_type = _MEDIA_DEMO_TYPE[ext]
        self._send_json({
            'filename':  safe_name,
            'path':      f'content/media/{safe_name}',
            'demo_type': demo_type,
        })

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

    def _read_multipart(self):
        """Parse multipart/form-data from the request body into a dict of
        {field_name: {'filename': str, 'data': bytes}}."""
        ct = self.headers.get('Content-Type', '')
        boundary = ''
        for seg in ct.split(';'):
            seg = seg.strip()
            if seg.lower().startswith('boundary='):
                boundary = seg[9:].strip().strip('"')
                break
        if not boundary:
            return {}

        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length)
        delim  = b'--' + boundary.encode('ascii')
        result = {}

        for raw in body.split(delim)[1:]:     # [0] is the prelude (empty)
            if raw.startswith(b'--'):          # final boundary marker
                break
            if raw.startswith(b'\r\n'):
                raw = raw[2:]
            if b'\r\n\r\n' not in raw:
                continue

            header_bytes, data = raw.split(b'\r\n\r\n', 1)
            if data.endswith(b'\r\n'):         # strip framing bytes
                data = data[:-2]

            headers = {}
            for line in header_bytes.split(b'\r\n'):
                if b':' in line:
                    k, v = line.split(b':', 1)
                    headers[k.strip().lower().decode()] = v.strip().decode()

            cd = headers.get('content-disposition', '')
            name = filename = ''
            for item in cd.split(';'):
                item = item.strip()
                if item.startswith('name='):
                    name = item[5:].strip('"')
                elif item.startswith('filename='):
                    filename = item[9:].strip('"')

            if name:
                result[name] = {'filename': filename, 'data': data}

        return result

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
        if not re.fullmatch(r'[a-z0-9][a-z0-9\-]*', card_id):
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

    http.server.test(
        HandlerClass=KioskHandler,
        ServerClass=DualStackServer,
        port=args.port,
        bind=args.bind,
        protocol="HTTP/1.1",
    )

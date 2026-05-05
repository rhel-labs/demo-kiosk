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
# Accepts the same CLI arguments as `python3 -m http.server`:
#   python3 serve.py 8181 --bind :: --directory /srv/faq
#
# ================================================================

import argparse
import contextlib
import http.server
import os
import re
import socket


class KioskHandler(http.server.SimpleHTTPRequestHandler):

    def end_headers(self):
        # Suppress no-store for media files: Chrome's media pipeline needs
        # to buffer range responses between requests and no-store blocks that.
        path = self.translate_path(self.path)
        if not self.guess_type(path).startswith(('video/', 'audio/')):
            self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def do_GET(self):
        if self._try_range():
            return
        super().do_GET()

    def do_HEAD(self):
        if self._try_range():
            return
        super().do_HEAD()

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

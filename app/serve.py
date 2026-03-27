# ================================================================
# serve.py — Cache-busting HTTP server for the FAQ Kiosk
# ================================================================
# Wraps Python's built-in http.server with one addition:
# every response includes "Cache-Control: no-store" so that
# browsers never serve stale assets from disk cache or bfcache.
# This matters on kiosk displays where the browser session persists
# across image rebuilds and content updates.
#
# Accepts the same CLI arguments as `python3 -m http.server`:
#   python3 serve.py 8181 --bind :: --directory /srv/faq
#
# ================================================================

import argparse
import contextlib
import http.server
import socket


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


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
        HandlerClass=NoCacheHandler,
        ServerClass=DualStackServer,
        port=args.port,
        bind=args.bind,
    )

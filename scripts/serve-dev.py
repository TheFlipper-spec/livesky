#!/usr/bin/env python3
"""LiveSky dev server.

Static server for docs/ with NO-CACHE headers, so JS/CSS/HTML updates are
always visible after a reload (no stale service-worker / browser cache while
developing v1.4). Binds 0.0.0.0 for the Arena preview.

Usage: npm run serve   (or: python3 scripts/serve-dev.py 8000)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'docs'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # No-store: the page must never serve a stale copy of an updated file.
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write('[serve] %s\n' % (fmt % args))


if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', PORT), NoCacheHandler)
    print(f'LiveSky dev server: http://0.0.0.0:{PORT}/  (docs/, no-cache)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass

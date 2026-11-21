"""Serve the clickable product demo, running the actual models when watch data is loaded.

Usage: .venv/bin/python -B demo_model/server.py --port 8001
"""
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit

from build_data import build_source

LOCK = Lock()


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path != "/anna_data.js":
            return super().do_GET()
        with LOCK:
            source = build_source()
        body = ("window.MODEL_LIVE = true;const ANNA_SOURCE = " + json.dumps(source, allow_nan=False) + ";").encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    print(f"Migrai product demo: http://localhost:{args.port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(Path(__file__).parent))).serve_forever()

"""Serve the animated demo, rerunning the saved models when its week data loads.

Usage: .venv/bin/python demo_model/server.py --port 8001
"""
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlsplit

from build_data import Demo

DEMO = None
LOCK = Lock()


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        url = urlsplit(self.path)
        if url.path not in ("/api/day", "/week.js"):
            return super().do_GET()
        try:
            with LOCK:
                if url.path == "/week.js":
                    result = DEMO.week()
                else:
                    index = int(parse_qs(url.query).get("index", [str(DEMO.meta["defaultIndex"])])[0])
                    result = DEMO.snapshot(index)
        except (ValueError, IndexError):
            return self.send_error(400, "Invalid day index")
        body = json.dumps(result, allow_nan=False)
        if url.path == "/week.js":
            body = "window.MODEL_LIVE = true;window.WEEK = " + body + ";"
        body = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript" if url.path == "/week.js" else "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8001)
    args = ap.parse_args()
    DEMO = Demo()
    print(f"Model-driven Follow Anna: http://localhost:{args.port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(Path(__file__).parent))).serve_forever()

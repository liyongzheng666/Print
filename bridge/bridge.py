#!/usr/bin/env python3
# =====================================================================
# Print Bridge (linkage slice A) — Python standard library only.
#
# Tails a Session's events.ndjson and streams it to the viewer over SSE,
# and statically serves the Session's assets/ directory. It NEVER calls a
# kit binary and never triangulates BREP; mesh assets are produced by the
# kit (occ-debug-mesh) and only served as files here.
#
# Contracts (docs/print-linkage-tech-decisions.md §3):
#   - §3.2 cold-start replay: a fresh /events connection replays the whole
#          events.ndjson, then tails. Resume honors Last-Event-ID.
#   - §3.3 the SSE id is the GLOBAL line number, independent of per-run seq.
#   - §3.4 only complete (\n-terminated) lines are emitted; a half-written
#          trailing line is tolerated and held until completed.
#
#   Usage:
#     bridge/bridge.py [--session DIR] [--host 127.0.0.1] [--port 7341]
#                      [--allow-origin ORIGIN] [--poll SECONDS]
#
#   Defaults: session = $OCC_DEBUG_SESSION or .occ-debug/sessions/dev
# =====================================================================
import argparse
import json
import mimetypes
import os
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

HEARTBEAT_SECONDS = 15.0


class SessionTailer:
    """Drains complete lines from events.ndjson, tracking a global line number.

    A trailing line without a final newline is treated as a half-written
    record (the producer may be mid-write) and is NOT emitted until the
    newline arrives.
    """

    def __init__(self, events_path: Path):
        self.events_path = events_path
        self.offset = 0
        self.lineno = 0

    def drain(self):
        """Yield (lineno, text) for every complete line since last drain."""
        if not self.events_path.exists():
            return
        with self.events_path.open("r", encoding="utf-8") as handle:
            handle.seek(self.offset)
            while True:
                line = handle.readline()
                if line.endswith("\n"):
                    self.lineno += 1
                    self.offset = handle.tell()
                    yield self.lineno, line.rstrip("\n")
                else:
                    # Partial trailing line or EOF: rewind and stop. The bytes
                    # are re-read on the next drain once the line completes.
                    handle.seek(self.offset)
                    return


class BridgeHandler(BaseHTTPRequestHandler):
    # Injected by the server factory.
    session_dir: Path
    events_path: Path
    assets_dir: Path
    allow_origin: str
    poll_seconds: float

    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # quieter, single-line logs
        print(f"[bridge] {self.address_string()} {fmt % args}")

    # ---- routing ---------------------------------------------------------
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/events":
            self.handle_events()
        elif path == "/health":
            self.handle_health()
        elif path.startswith("/assets/"):
            self.handle_asset(path[len("/assets/"):])
        else:
            self.send_error(HTTPStatus.NOT_FOUND, "not found")

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors_headers()
        self.send_header("Access-Control-Allow-Headers", "Last-Event-ID, Cache-Control")
        self.end_headers()

    # ---- /health ---------------------------------------------------------
    def handle_health(self):
        body = json.dumps({
            "ok": True,
            "session": str(self.session_dir),
            "events_exists": self.events_path.exists(),
        }).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    # ---- /events (SSE) ---------------------------------------------------
    def handle_events(self):
        last_event_id = self._last_event_id()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self._cors_headers()
        self.end_headers()

        tailer = SessionTailer(self.events_path)
        last_beat = time.monotonic()
        try:
            # §3.2 replay from the start; §3.3 skip anything already seen by a
            # resuming client (Last-Event-ID = last global line number).
            while True:
                sent_any = False
                for lineno, text in tailer.drain():
                    if lineno <= last_event_id:
                        continue
                    self._send_event(lineno, text)
                    sent_any = True
                now = time.monotonic()
                if not sent_any:
                    if now - last_beat >= HEARTBEAT_SECONDS:
                        self.wfile.write(b": keep-alive\n\n")
                        self.wfile.flush()
                        last_beat = now
                    time.sleep(self.poll_seconds)
                else:
                    last_beat = now
        except (BrokenPipeError, ConnectionResetError):
            return  # client closed the EventSource

    def _send_event(self, lineno: int, data: str):
        # data is a single-line JSON record; SSE "data:" must not contain \n.
        payload = f"id: {lineno}\ndata: {data}\n\n".encode("utf-8")
        self.wfile.write(payload)
        self.wfile.flush()

    def _last_event_id(self) -> int:
        raw = self.headers.get("Last-Event-ID")
        if raw is None:
            return 0
        try:
            return max(0, int(raw))
        except ValueError:
            return 0

    # ---- /assets/<path> (static) ----------------------------------------
    def handle_asset(self, rel: str):
        rel = unquote(rel)
        # §H9 path-traversal guard: resolve and require containment.
        target = (self.assets_dir / rel).resolve()
        try:
            target.relative_to(self.assets_dir.resolve())
        except ValueError:
            self.send_error(HTTPStatus.FORBIDDEN, "path escapes assets dir")
            return
        if not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "asset not found")
            return
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(data)

    # ---- shared ----------------------------------------------------------
    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", self.allow_origin)


def make_handler(session_dir: Path, allow_origin: str, poll_seconds: float):
    class _Handler(BridgeHandler):
        pass

    _Handler.session_dir = session_dir
    _Handler.events_path = session_dir / "events.ndjson"
    _Handler.assets_dir = session_dir / "assets"
    _Handler.allow_origin = allow_origin
    _Handler.poll_seconds = poll_seconds
    return _Handler


def main() -> int:
    parser = argparse.ArgumentParser(description="Print Bridge — tail events.ndjson to SSE, serve assets (stdlib only).")
    default_session = os.environ.get("OCC_DEBUG_SESSION", ".occ-debug/sessions/dev")
    parser.add_argument("--session", default=default_session, help="Session directory (default: $OCC_DEBUG_SESSION or .occ-debug/sessions/dev)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7341)
    parser.add_argument("--allow-origin", default="*", help="Access-Control-Allow-Origin value (default: *, for localhost dev)")
    parser.add_argument("--poll", type=float, default=0.2, help="Tail poll interval in seconds (default: 0.2)")
    args = parser.parse_args()

    session_dir = Path(args.session)
    (session_dir / "assets").mkdir(parents=True, exist_ok=True)

    handler = make_handler(session_dir, args.allow_origin, args.poll)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"[bridge] session = {session_dir}")
    print(f"[bridge] listening on http://{args.host}:{args.port}  (GET /events, /assets/<path>, /health)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[bridge] shutting down")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Small Prism Central-compatible simulator for local ZTF-Orchestrator testing.

The simulator intentionally implements only stable, low-risk API shapes used by
connection tests and local integration smoke tests. It is not a Nutanix product
emulator and should not be used as a source of truth for Prism behavior.
"""

from __future__ import annotations

import argparse
import base64
import json
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


DEFAULT_USERNAME = "admin"
DEFAULT_PASSWORD = "nutanix/4u"  # nosec B105


class PrismCentralSimulatorHandler(BaseHTTPRequestHandler):
    server_version = "ZTFPrismCentralSimulator/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        if getattr(self.server, "quiet", False):
            return
        super().log_message(fmt, *args)

    def _write_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}

    def _authenticated(self) -> bool:
        expected = f"{self.server.username}:{self.server.password}".encode("utf-8")
        expected_header = "Basic " + base64.b64encode(expected).decode("ascii")
        return self.headers.get("Authorization") == expected_header

    def _require_auth(self) -> bool:
        if self._authenticated():
            return True
        self.send_response(HTTPStatus.UNAUTHORIZED)
        self.send_header("WWW-Authenticate", 'Basic realm="Prism Central Simulator"')
        self.send_header("Content-Length", "0")
        self.end_headers()
        return False

    def do_GET(self) -> None:
        if self.path == "/health":
            self._write_json(HTTPStatus.OK, {"ok": True, "service": "prism-central-simulator"})
            return

        if self.path == "/api/nutanix/v3/users/me":
            if not self._require_auth():
                return
            self._write_json(
                HTTPStatus.OK,
                {
                    "username": self.server.username,
                    "display_name": "ZTF Local Simulator",
                    "user_type": "LOCAL",
                },
            )
            return

        self._write_json(HTTPStatus.NOT_FOUND, {"error": "not found", "path": self.path})

    def do_POST(self) -> None:
        if not self.path.startswith("/api/nutanix/v3/"):
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "not found", "path": self.path})
            return
        if not self._require_auth():
            return

        self._read_json_body()
        if self.path == "/api/nutanix/v3/clusters/list":
            self._write_json(
                HTTPStatus.OK,
                {
                    "metadata": {"total_matches": 1, "kind": "cluster"},
                    "entities": [
                        {
                            "metadata": {"uuid": "00000000-0000-0000-0000-000000000001"},
                            "status": {"name": "ztf-simulated-cluster", "state": "COMPLETE"},
                        }
                    ],
                },
            )
            return

        if self.path == "/api/nutanix/v3/tasks/list":
            self._write_json(
                HTTPStatus.OK,
                {
                    "metadata": {"total_matches": 1, "kind": "task"},
                    "entities": [
                        {
                            "metadata": {"uuid": "11111111-1111-1111-1111-111111111111"},
                            "status": {
                                "state": "SUCCEEDED",
                                "percentage_complete": 100,
                                "start_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                            },
                        }
                    ],
                },
            )
            return

        self._write_json(
            HTTPStatus.ACCEPTED,
            {
                "metadata": {"kind": "simulated-response"},
                "status": {"state": "ACCEPTED", "path": self.path},
            },
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a local Prism Central API simulator.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host. Default: 127.0.0.1")
    parser.add_argument("--port", type=int, default=9440, help="Bind port. Default: 9440")
    parser.add_argument("--username", default=DEFAULT_USERNAME, help="Basic auth username.")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="Basic auth password.")
    parser.add_argument("--quiet", action="store_true", help="Suppress request logging.")
    args = parser.parse_args()

    httpd = ThreadingHTTPServer((args.host, args.port), PrismCentralSimulatorHandler)
    httpd.username = args.username
    httpd.password = args.password
    httpd.quiet = args.quiet
    print(f"Prism Central simulator listening on http://{args.host}:{args.port}")
    print(f"Credentials: {args.username} / {args.password}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()

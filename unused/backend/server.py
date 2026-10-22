#!/usr/bin/env python3
"""
Home Guard - Local Standalone MCP Server
Runs on port 8000 with zero external pip dependencies.
Supports Streamable HTTP, CORS, and full MCP JSON-RPC 2.0 protocol.
"""

import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mcp_handler import handle_mcp_request
from auth import get_oauth_authorization_server_metadata
import json

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class McpHttpHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Mcp-Session-Id")
        self.send_header("Access-Control-Expose-Headers", "Mcp-Session-Id")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        clean_path = self.path.split("?")[0].rstrip("/")
        if clean_path == "/.well-known/oauth-authorization-server":
            metadata = get_oauth_authorization_server_metadata()
            payload = json.dumps(metadata, indent=2).encode("utf-8")
            self.send_response(200)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        if clean_path.endswith("/mcp"):
            # Rule: GET on /mcp returns 405 Method Not Allowed
            payload = json.dumps({
                "jsonrpc": "2.0",
                "error": {"code": -32601, "message": "Method Not Allowed. Use POST for MCP JSON-RPC."},
            }).encode("utf-8")
            self.send_response(405)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Allow", "POST")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        # Simple health check endpoint
        self.send_response(200)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        body = b'{"status": "ok", "service": "Home Guard MCP Server", "spec": "2025-11-25"}'
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_DELETE(self):
        clean_path = self.path.split("?")[0].rstrip("/")
        if clean_path.endswith("/mcp"):
            payload = json.dumps({
                "jsonrpc": "2.0",
                "error": {"code": -32601, "message": "Method Not Allowed. Use POST for MCP JSON-RPC."},
            }).encode("utf-8")
            self.send_response(405)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Allow", "POST")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        self.send_response(405)
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b""
        body_str = body_bytes.decode("utf-8", errors="replace")

        # Extract headers dictionary
        headers_dict = {k: v for k, v in self.headers.items()}

        status_code, resp_headers, resp_body = handle_mcp_request(
            http_method="POST",
            path=self.path,
            headers=headers_dict,
            body_str=body_str,
        )

        resp_bytes = resp_body.encode("utf-8")
        self.send_response(status_code)
        self._send_cors_headers()
        for k, v in resp_headers.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(resp_bytes)))
        self.end_headers()
        self.wfile.write(resp_bytes)

def run():
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0")
    server_address = (host, port)
    httpd = ThreadedHTTPServer(server_address, McpHttpHandler)
    print(f"============================================================")
    print(f" Home Guard MCP Server listening on http://{host}:{port}/mcp")
    print(f" Spec: 2025-11-25 Streamable HTTP (stateless)")
    print(f" Provider: {os.environ.get('DEVICE_PROVIDER', 'lifx')}")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == "__main__":
    run()

"""
Home Guard - Main AWS Lambda Handler
Serves HTTP API / Lambda Function URL for /mcp and OAuth discovery.
"""

import json
import base64
from typing import Dict, Any

from mcp_handler import handle_mcp_request
from auth import get_oauth_authorization_server_metadata

def _build_cors_headers(origin: str = "*") -> Dict[str, str]:
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Mcp-Session-Id",
        "Access-Control-Expose-Headers": "Mcp-Session-Id",
    }

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda entry point for API Gateway HTTP API (payload v2.0) or Function URL.
    """
    # Extract request properties
    raw_path = event.get("rawPath") or event.get("path") or "/"
    http_context = event.get("requestContext", {}).get("http", {})
    method = (http_context.get("method") or event.get("httpMethod") or "POST").upper()
    headers = event.get("headers") or {}

    request_origin = headers.get("origin") or headers.get("Origin") or "*"
    cors_headers = _build_cors_headers(request_origin)

    # 1. Handle Preflight OPTIONS
    if method == "OPTIONS":
        return {
            "statusCode": 204,
            "headers": cors_headers,
            "body": "",
        }

    # 2. RFC 8414 OAuth Authorization Server Metadata
    if raw_path.rstrip("/") == "/.well-known/oauth-authorization-server" and method == "GET":
        metadata = get_oauth_authorization_server_metadata()
        response_headers = {**cors_headers, "Content-Type": "application/json"}
        return {
            "statusCode": 200,
            "headers": response_headers,
            "body": json.dumps(metadata, indent=2),
        }

    # 3. Decode Body
    body_str = event.get("body", "")
    if event.get("isBase64Encoded", False) and body_str:
        body_str = base64.b64decode(body_str).decode("utf-8")

    # 4. Dispatch to MCP handler
    status_code, resp_headers, resp_body = handle_mcp_request(
        http_method=method,
        path=raw_path,
        headers=headers,
        body_str=body_str or "",
    )

    # Combine response headers with CORS headers
    combined_headers = {**cors_headers, **resp_headers}

    return {
        "statusCode": status_code,
        "headers": combined_headers,
        "body": resp_body,
    }

"""
Home Guard - MCP Streamable HTTP Protocol Handler
Spec 2025-11-25
"""

import json
import uuid
from typing import Dict, Any, Tuple, Optional

from auth import validate_bearer_token
from tools import (
    TOOL_DEFINITIONS,
    tool_list_devices,
    tool_set_group_state,
    tool_naive_set_group_state,
    tool_schedule_action,
    tool_get_ledger,
)

PROTOCOL_VERSION = "2025-11-25"
SERVER_INFO = {
    "name": "home-guard-mcp",
    "version": "1.0.0",
}

def handle_mcp_request(
    http_method: str,
    path: str,
    headers: Dict[str, str],
    body_str: str,
    provider_override=None
) -> Tuple[int, Dict[str, str], str]:
    """
    Main dispatch routine for /mcp endpoint.
    Returns: (status_code: int, headers: Dict[str, str], response_body: str)
    """
    # Normalize headers to lowercase keys
    norm_headers = {k.lower(): v for k, v in headers.items()}

    # 1. Method verification: GET and DELETE on /mcp return 405 Method Not Allowed
    clean_path = path.split("?")[0].rstrip("/")
    if clean_path.endswith("/mcp"):
        if http_method.upper() in ("GET", "DELETE"):
            return 405, {"Content-Type": "application/json", "Allow": "POST"}, json.dumps({
                "jsonrpc": "2.0",
                "error": {"code": -32601, "message": "Method Not Allowed. Use POST for MCP JSON-RPC."},
            })
        if http_method.upper() != "POST":
            return 405, {"Content-Type": "application/json", "Allow": "POST"}, json.dumps({
                "jsonrpc": "2.0",
                "error": {"code": -32601, "message": "Method Not Allowed."},
            })

    # 2. Authentication Check:
    # Rule 4: Unauthenticated or invalid requests return HTTP 401 with NO WWW-Authenticate header.
    auth_header = norm_headers.get("authorization")
    is_valid, auth_err, claims = validate_bearer_token(auth_header)
    if not is_valid:
        # Crucial: NO WWW-Authenticate header in response!
        return 401, {"Content-Type": "application/json"}, json.dumps({
            "jsonrpc": "2.0",
            "error": {"code": -32000, "message": f"Unauthorized: {auth_err}"},
        })

    # 3. Parse JSON-RPC 2.0 payload
    if not body_str or not body_str.strip():
        return 400, {"Content-Type": "application/json"}, json.dumps({
            "jsonrpc": "2.0",
            "error": {"code": -32700, "message": "Parse error: Empty request body"},
        })

    try:
        rpc_req = json.loads(body_str)
    except Exception as e:
        return 400, {"Content-Type": "application/json"}, json.dumps({
            "jsonrpc": "2.0",
            "error": {"code": -32700, "message": f"Parse error: {e}"},
        })

    # Support Mcp-Session-Id
    session_id = norm_headers.get("mcp-session-id") or f"sess_{uuid.uuid4().hex[:12]}"
    resp_headers = {
        "Content-Type": "application/json",
        "Mcp-Session-Id": session_id,
    }

    req_id = rpc_req.get("id")
    method = rpc_req.get("method")
    params = rpc_req.get("params", {})

    # Handle notifications (requests without an id)
    if req_id is None:
        if method == "notifications/initialized":
            return 202, resp_headers, ""
        return 204, resp_headers, ""

    # JSON-RPC 2.0 Dispatcher
    try:
        if method == "initialize":
            client_protocol = params.get("protocolVersion", PROTOCOL_VERSION)
            return 200, resp_headers, json.dumps({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {
                        "tools": {},
                    },
                    "serverInfo": SERVER_INFO,
                },
            })

        elif method == "ping":
            return 200, resp_headers, json.dumps({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {},
            })

        elif method == "tools/list":
            return 200, resp_headers, json.dumps({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "tools": TOOL_DEFINITIONS,
                },
            })

        elif method == "tools/call":
            tool_name = params.get("name")
            tool_args = params.get("arguments", {})

            result_data = None

            if tool_name == "list_devices":
                result_data = tool_list_devices(provider=provider_override)

            elif tool_name == "set_group_state":
                result_data = tool_set_group_state(
                    target=tool_args.get("target", ""),
                    state=bool(tool_args.get("state", False)),
                    command_id=tool_args.get("command_id"),
                    provider=provider_override,
                )

            elif tool_name == "naive_set_group_state":
                result_data = tool_naive_set_group_state(
                    target=tool_args.get("target", ""),
                    state=bool(tool_args.get("state", False)),
                    provider=provider_override,
                )

            elif tool_name == "schedule_action":
                result_data = tool_schedule_action(
                    target=tool_args.get("target", ""),
                    state=bool(tool_args.get("state", False)),
                    when_iso=tool_args.get("when_iso", ""),
                    recurrence=tool_args.get("recurrence", "once"),
                    user_said_recurring=bool(tool_args.get("user_said_recurring", False)),
                    confirmed=bool(tool_args.get("confirmed", False)),
                    plan_id=tool_args.get("plan_id"),
                )

            elif tool_name == "get_ledger":
                result_data = tool_get_ledger(command_id=tool_args.get("command_id", ""))

            else:
                return 200, resp_headers, json.dumps({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {
                        "code": -32601,
                        "message": f"Tool '{tool_name}' not found",
                    },
                })

            # Format tool call response per MCP spec
            return 200, resp_headers, json.dumps({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(result_data),
                        }
                    ],
                    "isError": False,
                },
            })

        else:
            return 200, resp_headers, json.dumps({
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {
                    "code": -32601,
                    "message": f"Method '{method}' not implemented",
                },
            })

    except Exception as e:
        return 200, resp_headers, json.dumps({
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {
                "code": -32000,
                "message": str(e),
            },
        })

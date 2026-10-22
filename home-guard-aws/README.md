# Home Guard on AWS (SAM)

Command-contract MCP server (Streamable HTTP, spec 2025-11-25) on **Lambda Function URL**, with **DynamoDB** (devices, ledger, schedules) and **EventBridge Scheduler** (real one-time schedules). Zero third-party Python dependencies.

## Deploy
    pip install aws-sam-cli            # or use the installer from AWS docs
    aws configure                      # region + credentials
    sam build
    sam deploy --guided                # enter McpToken (16+ random chars), keep defaults otherwise
The stack prints **McpUrl**. Every request needs `Authorization: Bearer <McpToken>`.

## Smoke test
    export URL=<McpUrl>; export TOKEN=<McpToken>
    curl -s $URL -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
    curl -s $URL -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"set_group_state","arguments":{"target":"living room","state":true}}}'
No token returns 401 (no WWW-Authenticate header).

## Tools
list_devices, set_group_state (verify + one retry + dedupe), naive_set_group_state (control, no verification), schedule_action (one-time unless user explicitly says recurring; confirm first), get_ledger. Demo-only: demo_set_online, demo_reset (DemoMode=true).

## Devices
- `DeviceProvider=virtual` (default): persistent virtual devices in DynamoDB. Faults are simulated and labeled: the Fan fails its first attempt; use `demo_set_online` to take a device offline.
- `DeviceProvider=lifx`: real LIFX bulbs via the LIFX HTTP API (set `LifxToken`). Verify endpoint details against current LIFX docs.

## Tests
    pip install pytest && python -m pytest -q tests

## Not done yet / honest limits
- OAuth: this build uses a static bearer token. Alexa+ onboarding expects OAuth metadata at /.well-known/oauth-authorization-server (returns 404 here). Next step: Amazon Cognito.
- Latency: warm calls are fast; Lambda cold starts can exceed 500 ms. Mitigate with provisioned concurrency.
- Template and scheduler calls were written without a live AWS deploy test. Please report any deploy error.
- If the Function URL returns 403, add a public invoke permission for the function URL (AWS changed Function URL permission requirements; check the current Lambda docs).
- Tighten CorsOrigin and rotate McpToken after the demo.

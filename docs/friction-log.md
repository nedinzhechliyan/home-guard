# Home Guard — Developer & Integration Friction Log

This document tracks developer friction, unexpected edge cases, and protocol nuances discovered while building and deploying a self-hosted Model Context Protocol (MCP) Streamable HTTP server on AWS Serverless for Alexa+.

---

## Log Entry 1: Streamable HTTP Spec (2025-11-25) Method Restrictions on `/mcp`

- **Task**: Implement the standard `/mcp` endpoint conforming to the MCP Streamable HTTP 2025-11-25 specification.
- **Steps**:
  1. Configured HTTP router to accept JSON-RPC payloads on `/mcp`.
  2. Tested standard HTTP methods (`GET`, `DELETE`, `OPTIONS`, `POST`).
- **Expected**: `GET` and `DELETE` on `/mcp` should either return a discovery object or be gracefully rejected.
- **Actual**: The MCP Streamable HTTP specification strictly mandates that `GET` and `DELETE` on the MCP endpoint must return `405 Method Not Allowed` with an `Allow: POST` header. Standard API Gateway configurations default to `404` or `403` if method routing is not explicitly defined.
- **Severity**: Medium (Protocol Compliance).
- **Workaround**: Added explicit routes in `template.yaml` for `GET /mcp` and `DELETE /mcp` pointing to the handler, returning `405 Method Not Allowed` with `Allow: POST`.
- **Suggestion**: Include an explicit conformance check in the Alexa AI CLI validator for `405 Method Not Allowed` responses on non-POST requests to `/mcp`.

---

## Log Entry 2: Unauthorized HTTP 401 without `WWW-Authenticate` Header

- **Task**: Enforce Cognito JWT authentication on MCP endpoints.
- **Steps**:
  1. Intercept unauthenticated incoming JSON-RPC calls.
  2. Return standard HTTP 401 Unauthorized status.
- **Expected**: Standard web APIs often emit `WWW-Authenticate: Bearer realm="..."`.
- **Actual**: MCP clients and voice runtimes may trigger browser authentication modals or misinterpret challenge headers if `WWW-Authenticate` is present.
- **Severity**: High (Client Hang / Unexpected Prompting).
- **Workaround**: Explicitly stripped `WWW-Authenticate` from all 401 response headers across Lambda and the local HTTP server.
- **Suggestion**: Clearly document in the MCP specification that machine-to-machine agents expect bare `401 Unauthorized` without interactive challenge headers.

---

## Log Entry 3: Voice Assistant Ambiguity & Stealth Routine Creation (Rule 5)

- **Task**: Safely process natural language scheduling requests like "Turn on the living room at 8pm".
- **Steps**:
  1. Assistant parses "8pm" and infers temporal trigger.
  2. Standard assistants often automatically create recurring routines (e.g. daily at 8pm) without notifying the household, leading to lights mysteriously turning on weeks later.
- **Expected**: Schedule the action strictly once.
- **Actual**: Assistants often default to creating persistent routines.
- **Severity**: High (User Trust / Physical Home Disturbance).
- **Workaround**: Implemented Rule 5 in Home Guard: any schedule with recurrence other than `"once"` requires `user_said_recurring: true`. If the user did not say "every day", "daily", or "weekdays", recurrence is strictly forced to `"once"`, and a two-turn confirmation (`needs_confirmation: true`) is required before any EventBridge Scheduler rule is deployed.
- **Suggestion**: Voice platforms should mandate explicit, spoken confirmation for any recurring automation before saving it to the household profile.

---

## Log Entry 4: Smart Bulb Fleet Latency & Readback Race Conditions

- **Task**: Turn on a room containing 5 smart bulbs within a <500ms round-trip budget.
- **Steps**:
  1. Dispatched HTTP PUT commands to LIFX / Home Assistant in sequence.
  2. Sequential calls took ~1,200ms.
  3. Reading back state immediately after dispatching commands returned old state because bulb hardware firmware takes 80-150ms to report power level changes.
- **Expected**: Fast, verified response within 500ms.
- **Actual**: Sequential dispatch caused timeout; immediate readback reported false failures.
- **Severity**: Critical (Perceived Unreliability).
- **Workaround**:
  1. Used `ThreadPoolExecutor` to dispatch power commands in parallel across all online devices.
  2. Filtered offline devices upfront to prevent hanging on TCP timeouts.
  3. Executed a single batch state query (`read_state()`) for verification.
  4. Implemented a single bounded retry only for online devices that failed on the first attempt.
- **Suggestion**: IoT bridge providers should support batched WebSocket state assertions or atomic multi-device endpoints with server-side completion receipts.

---

## Log Entry 5: Duplicate Commands & Assistant Idempotency

- **Task**: Handle repeated commands caused by network re-transmissions or nervous double-taps in the mobile UI.
- **Steps**:
  1. Voice assistant retried command due to delayed acknowledgment.
  2. Device state was re-asserted, causing light flickering and duplicate audit logs.
- **Expected**: Second execution should return the cached outcome without repeating physical hardware calls.
- **Actual**: Without a persistent idempotency ledger, multiple physical commands are sent to the bulbs.
- **Severity**: Medium.
- **Workaround**: Added DynamoDB conditional writes (`attribute_not_exists(command_id)`) with a 30-second deduplication window. Returning the stored result with `duplicate: true` prevents redundant mesh traffic.
- **Suggestion**: All Alexa+ MCP tools should standardize a mandatory `command_id` header or argument.

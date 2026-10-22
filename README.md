# Home Guard
Command-contract MCP server for Alexa+ add-ons. It executes a household command once, completely, verifies real device state, retries failures once, dedupes repeats, and never creates a surprise routine.
- **Server:** `home-guard-aws/` is an MCP server (Streamable HTTP, spec 2025-11-25) on AWS Lambda Function URL + DynamoDB (ledger, devices, schedules) + EventBridge Scheduler. Deploy with `sam build && sam deploy --guided`.
- **Console:** this React app is an Alexa+-style client (a simulation of the Alexa+ side only) that calls the real MCP server. Run it with `npm install --legacy-peer-deps && npm run dev`, then enter the MCP URL and bearer token in Settings (kept in memory only).
- **Devices:** virtual by default (persistent in DynamoDB, faults are simulated and labeled); optional LIFX adapter.
- **Not done yet:** OAuth/Cognito for Alexa+ onboarding; real device testing.
License: MIT.

# Home Guard — Command-Contract Reliability Layer for Alexa+ MCP on AWS Serverless

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](https://opensource.org/licenses/MIT)
[![MCP Spec](https://img.shields.io/badge/MCP%20Spec-2025--11--25-blue.svg)](https://spec.modelcontextprotocol.io)
[![AWS Serverless](https://img.shields.io/badge/AWS-Serverless%20SAM-orange.svg)](https://aws.amazon.com/serverless/sam/)

**Home Guard** is a reference reliability layer and self-hosted **Model Context Protocol (MCP)** server built on AWS Serverless for the **Amazon Developer Hackathon (Alexa+ Track & AWS Builder Mini Challenge)**.

Smart-home voice assistants often suffer from common reliability pitfalls:
1. **Partial Execution**: Assistants announce *"Done!"* even when only 4 of 5 lights in a group actually turned on, or when an offline device silently failed.
2. **Phantom Routines**: Casual scheduled phrases like *"Turn on the porch light at 8pm"* can cause assistants to silently create daily recurring routines that run indefinitely.
3. **Command Duplication**: Unstable network connections or assistant re-prompts re-execute physical commands against home mesh devices without deduplication.

Home Guard solves this by establishing a strict **Command Contract**:
- Executes household commands **once, completely, with real hardware verification**.
- Retries online device failures **exactly once** within a **<500ms round-trip budget**.
- Skips unreachable offline devices upfront and reports exact non-done items: `"4 of 5 on. Not done: Floor lamp (offline)."`.
- **Never creates stealth routines**: Enforces Rule 5 (all timed schedules are strictly one-time unless the user explicitly utters recurring keywords, followed by explicit two-turn confirmation).
- Implements atomic DynamoDB idempotency using conditional writes.

---

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Client["Alexa+ & Web Console"]
        Console["Home Guard Web Console\n(React + TypeScript)"]
        AlexaClient["Alexa+ Voice Assistant\n(MCP Client)"]
    end

    subgraph AWS["AWS Serverless Stack (Home Guard)"]
        APIGW["Amazon API Gateway HTTP API v2\n(POST /mcp | GET /.well-known)"]
        Cognito["Amazon Cognito User Pool\n(JWT Authentication & JWKS)"]
        
        subgraph Lambdas["Lambda Compute (Python 3.12 ARM64)"]
            McpLambda["HomeGuardMcpFunction\n(MCP Streamable HTTP Router)"]
            ExecLambda["HomeGuardExecutorFunction\n(Scheduled Action Execution)"]
        end

        subgraph Storage["Persistence & Scheduling"]
            DDBLedger[("DynamoDB Ledger\nPK: command_id (TTL: 7d)")]
            DDBSchedules[("DynamoDB Schedules\nPK: plan_id")]
            Scheduler["Amazon EventBridge Scheduler\n(One-time at() / cron)"]
        end
    end

    subgraph IoT["Real Smart Home Hardware"]
        LIFX["LIFX Cloud HTTP API\n(Real Lights & Power States)"]
        HomeAssistant["Home Assistant REST API\n(Real Local Entities)"]
    end

    Console -->|JSON-RPC 2.0 / Streamable HTTP| APIGW
    AlexaClient -->|MCP Spec 2025-11-25| APIGW
    APIGW -->|Cognito JWT / DEV_STATIC_TOKEN| McpLambda
    Cognito -.->|JWKS Key Verification| McpLambda
    
    McpLambda -->|Conditional Write / Idempotency| DDBLedger
    McpLambda -->|Store Plan| DDBSchedules
    McpLambda -->|Create Schedule at()| Scheduler
    Scheduler -->|Invoke Target| ExecLambda
    ExecLambda -->|Update Verified State| DDBLedger

    McpLambda -->|Parallel Dispatch & Readback| LIFX
    McpLambda -->|Parallel Dispatch & Readback| HomeAssistant
    ExecLambda -->|Execute Target Action| LIFX
    ExecLambda -->|Execute Target Action| HomeAssistant
```

---

## MCP Tools Implemented (Spec 2025-11-25)

| Tool Name | Arguments | Description & Contract |
| :--- | :--- | :--- |
| `list_devices` | `{}` | Returns real smart devices from provider (`name`, `group`, `online`, `on`, `brightness`). |
| `set_group_state` | `target: string, state: boolean, command_id?: string` | Executes group power state in parallel, reads back verified state, retries online failures once, and records conditional write in DynamoDB. Returns `{ok, message, done, total, not_done, command_id, ms}`. |
| `naive_set_group_state` | `target: string, state: boolean` | **Control experiment**: Fire-and-forget state change without verification or retries. Always returns `{"message": "Done!"}`. |
| `schedule_action` | `target, state, when_iso, recurrence, user_said_recurring, confirmed, plan_id` | Enforces Rule 5. First turn returns `{needs_confirmation: true, plan_id, message}`. Second turn with `confirmed: true` creates an EventBridge schedule. |
| `get_ledger` | `command_id: string` | Retrieves full audit entry from DynamoDB (planned count, verified count, retried device names, routine flag, latency). |

---

## Deployment Instructions (AWS SAM)

### Prerequisites
- AWS CLI configured with administrator permissions (`aws configure`).
- AWS SAM CLI installed (`sam --version`).
- Python 3.12 installed.
- (Optional) Node.js 20+ for local console testing.

### 1. Build the SAM Package
```bash
sam build
```

### 2. Guided Deployment to AWS
```bash
sam deploy --guided
```

You will be prompted for stack parameters:
- **Stack Name**: `home-guard-mcp`
- **AWS Region**: `us-east-1` (or your preferred region)
- **Parameter DeviceProvider**: `lifx` or `homeassistant`
- **Parameter LifxToken**: Your LIFX token from [cloud.lifx.com](https://cloud.lifx.com/settings) (masked)
- **Parameter HaUrl**: (Leave blank if using LIFX, or enter `https://your-ha-domain.com:8123`)
- **Parameter HaToken**: (Leave blank if using LIFX, or enter long-lived access token)
- **Parameter DevStaticToken**: (Optional secret for local testing; leave empty in production)
- **Parameter ConsoleOrigin**: `*` (or your console URL)
- **Allow SAM to create IAM roles**: `y`

### 3. Note the Outputs
Upon successful deployment, SAM outputs:
```text
Key: McpUrl
Value: https://<api-id>.execute-api.us-east-1.amazonaws.com/mcp

Key: OAuthMetadataUrl
Value: https://<api-id>.execute-api.us-east-1.amazonaws.com/.well-known/oauth-authorization-server

Key: CognitoUserPoolId
Value: us-east-1_xxxxxxxxx
```

---

## Connecting the Home Guard Console

1. Open the Home Guard Web Console in your browser.
2. Click **Settings** in the top navigation bar.
3. Enter your deployed `McpUrl` (e.g. `https://<api-id>.execute-api.us-east-1.amazonaws.com/mcp`).
4. Enter your `Bearer Token` (Cognito access token or `DEV_STATIC_TOKEN`).
5. Click **Test Handshake & Fetch Tools**.
6. Click **Save & Connect**.
7. The live tool badge will display `Connected` along with all real discovered MCP tools.

*Note: In accordance with security best practices, credentials are held in memory only and never stored in localStorage, cookies, or git commits.*

---

## Onboarding with the Alexa AI CLI

To onboard Home Guard as a self-hosted MCP server with Alexa+:

1. **Install and authenticate the Alexa AI CLI**:
   ```bash
   npm install -g @alexa/alexa-ai-cli
   alexa-ai auth login
   ```

2. **Register the Home Guard MCP Endpoint**:
   ```bash
   alexa-ai mcp register \
     --name "home-guard" \
     --url "https://<your-api-id>.execute-api.us-east-1.amazonaws.com/mcp" \
     --transport "streamable-http" \
     --auth-type "oauth2" \
     --authorization-server-url "https://<your-api-id>.execute-api.us-east-1.amazonaws.com/.well-known/oauth-authorization-server" \
     --client-id "<CognitoClientId>"
   ```

3. **Verify MCP Handshake with the CLI**:
   ```bash
   alexa-ai mcp test --name "home-guard"
   ```

4. **Associate with your Developer Alexa+ Sandbox**:
   ```bash
   alexa-ai skill enable --mcp-server "home-guard"
   ```

---

## Running Unit Tests Locally

Unit tests verify the entire protocol, acceptance criteria, and bounded-retry contracts using a recorded-response test double:

```bash
# Run with Python standard unittest runner:
python3 -m unittest backend/tests/test_mcp.py

# Or with pytest:
pytest backend/tests/test_mcp.py -v
```

### Test Coverage Highlights:
- **Test 1**: Verifies unauthenticated POST to `/mcp` returns HTTP 401 with **no** `WWW-Authenticate` header (Rule 4).
- **Test 2**: Verifies `GET` and `DELETE` on `/mcp` return HTTP 405 Method Not Allowed.
- **Test 3**: Verifies MCP spec 2025-11-25 three-step handshake (`initialize` -> `notifications/initialized` -> `tools/list`).
- **Test 4**: Verifies Rule 5: schedule request with `daily` recurrence without explicit user wording is forced to `once`.
- **Test 5**: Verifies parallel device execution, bounded retry of online failures, and skipping of offline devices.
- **Test 6**: Verifies DynamoDB conditional write idempotency deduplication.
- **Test 7**: Verifies control experiment (`naive_set_group_state`) returns `"Done!"` even when hardware fails.

---

## Running the Standalone Local MCP Server

For local debugging without AWS credentials, a standalone Python 3 server is included with zero pip dependencies:

```bash
# Configure local environment:
export DEVICE_PROVIDER="lifx"
export LIFX_TOKEN="your_lifx_token_here"
export DEV_STATIC_TOKEN="local-dev-token"

# Run the server:
python3 backend/server.py
```

The server will listen on `http://0.0.0.0:8000/mcp`.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

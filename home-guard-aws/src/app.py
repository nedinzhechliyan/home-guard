"""Home Guard: command-contract MCP server (Streamable HTTP, stateless) for an AWS Lambda Function URL.
No third-party dependencies (boto3 ships with the Lambda runtime)."""
import base64, hashlib, hmac, json, os, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26"]
SERVER_INFO = {"name": "home-guard", "version": "1.0.0"}
RECURRING = {"daily", "weekly", "weekdays"}
DEDUPE_WINDOW_S = 30
LEDGER_TTL_S = 7 * 24 * 3600

SEED = [
    {"device_id": "lr_ceiling", "name": "Ceiling light", "group": "living room", "online": True, "on": False, "flaky": False},
    {"device_id": "lr_floor", "name": "Floor lamp", "group": "living room", "online": True, "on": False, "flaky": False},
    {"device_id": "lr_fan", "name": "Fan", "group": "living room", "online": True, "on": False, "flaky": True},
    {"device_id": "lr_ac", "name": "AC", "group": "living room", "online": True, "on": False, "flaky": False},
    {"device_id": "lr_tv", "name": "TV light", "group": "living room", "online": True, "on": False, "flaky": False},
    {"device_id": "br_light", "name": "Bedroom light", "group": "bedroom", "online": True, "on": False, "flaky": False},
]

# ---------------------------------------------------------------- storage (DynamoDB)
class Store:
    def __init__(self):
        import boto3
        ddb = boto3.resource("dynamodb")
        self.devices = ddb.Table(os.environ["DEVICES_TABLE"])
        self.ledger = ddb.Table(os.environ["LEDGER_TABLE"])
        self.plans = ddb.Table(os.environ["SCHEDULES_TABLE"])

    def devices_all(self): return self.devices.scan()["Items"]
    def device_put(self, d): self.devices.put_item(Item=d)
    def device_delete(self, did): self.devices.delete_item(Key={"device_id": did})

    def ledger_get(self, cid):
        it = self.ledger.get_item(Key={"command_id": cid}).get("Item")
        return json.loads(it["record"]) if it else None

    def ledger_put(self, cid, rec):
        self.ledger.put_item(Item={"command_id": cid, "record": json.dumps(rec), "ttl": int(time.time()) + LEDGER_TTL_S})

    def plan_get(self, pid):
        it = self.plans.get_item(Key={"plan_id": pid}).get("Item")
        return json.loads(it["record"]) if it else None

    def plan_put(self, pid, rec):
        self.plans.put_item(Item={"plan_id": pid, "record": json.dumps(rec)})


STORE = None
SCHED = None
PROVIDER = None


def store():
    global STORE
    if STORE is None:
        STORE = Store()
    return STORE


def scheduler():
    global SCHED
    if SCHED is None:
        import boto3
        SCHED = boto3.client("scheduler")
    return SCHED


# ---------------------------------------------------------------- device providers
class VirtualProvider:
    """Persistent virtual devices in DynamoDB (state survives across invocations).
    Faults are simulated and labeled: 'flaky' devices fail their first attempt in a command."""
    def __init__(self, st): self.st = st

    def list(self):
        devs = self.st.devices_all()
        if not devs:
            for d in SEED:
                self.st.device_put(dict(d))
            devs = self.st.devices_all()
        return sorted(devs, key=lambda d: d["device_id"])

    def set_power(self, dev, state, attempt):
        if not dev["online"]:
            return False
        if dev.get("flaky") and attempt == 1:
            return False
        item = dict(dev); item["on"] = state
        self.st.device_put(item)
        return True


class LifxProvider:
    """Real lights through the LIFX HTTP API (verify endpoints against current LIFX docs)."""
    base = "https://api.lifx.com/v1"

    def __init__(self): self.token = os.environ["LIFX_TOKEN"]

    def _req(self, method, path, body=None):
        req = urllib.request.Request(self.base + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=4) as r:
            raw = r.read()
            return json.loads(raw) if raw else None

    def list(self):
        return [{"device_id": l["id"], "name": l.get("label", l["id"]),
                 "group": (l.get("group") or {}).get("name", "").lower(),
                 "online": bool(l.get("connected")), "on": l.get("power") == "on", "flaky": False}
                for l in self._req("GET", "/lights/all")]

    def set_power(self, dev, state, attempt):
        res = self._req("PUT", f"/lights/id:{dev['device_id']}/state", {"power": "on" if state else "off"})
        return bool(res and res.get("results") and res["results"][0].get("status") == "ok")


def provider():
    if PROVIDER is not None:
        return PROVIDER
    return LifxProvider() if os.environ.get("DEVICE_PROVIDER") == "lifx" else VirtualProvider(store())


# ---------------------------------------------------------------- helpers
def _str(a, k):
    v = a.get(k)
    if not isinstance(v, str) or not v.strip():
        raise ValueError(f"'{k}' must be a non-empty string")
    return v.strip()


def _bool(a, k):
    v = a.get(k)
    if not isinstance(v, bool):
        raise ValueError(f"'{k}' must be true or false")
    return v


def _match(devs, target):
    t = target.strip().lower().removeprefix("the ").strip()
    return [d for d in devs if d["group"] == t or d["name"].lower() == t]


def _pub(d):
    return {"id": d["device_id"], "name": d["name"], "group": d["group"], "online": bool(d["online"]), "on": bool(d["on"])}


def _send_all(prov, devs, state, attempt):
    def one(d):
        try:
            return prov.set_power(d, state, attempt)
        except Exception:
            return False
    if devs:
        with ThreadPoolExecutor(max_workers=8) as ex:
            list(ex.map(one, devs))


def _cid(target, state):
    bucket = int(time.time() // DEDUPE_WINDOW_S)
    return hashlib.sha1(f"{target.lower()}|{state}|{bucket}".encode()).hexdigest()[:10]


# ---------------------------------------------------------------- tools
def tool_list_devices(a):
    t0 = time.perf_counter()
    devs = [_pub(d) for d in provider().list()]
    return {"ok": True, "devices": devs, "ms": round((time.perf_counter() - t0) * 1000)}


def tool_set_group_state(a):
    t0 = time.perf_counter()
    target, state = _str(a, "target"), _bool(a, "state")
    cid = a.get("command_id") or _cid(target, state)
    prior = store().ledger_get(cid)
    if prior:
        return {**prior["summary"], "command_id": cid, "duplicate": True}
    prov = provider()
    devs = _match(prov.list(), target)
    if not devs:
        return {"ok": False, "error": f"Unknown target '{target}'"}
    _send_all(prov, [d for d in devs if d["online"]], state, 1)
    after = {d["device_id"]: d for d in prov.list()}
    failed = [d for d in devs if d["online"] and after[d["device_id"]]["on"] != state]
    retried = [d["name"] for d in failed]
    if failed:
        _send_all(prov, [after[d["device_id"]] for d in failed], state, 2)  # one bounded retry
        after = {d["device_id"]: d for d in prov.list()}
    done, bad = 0, []
    for d in devs:
        cur = after[d["device_id"]]
        if cur["online"] and cur["on"] == state:
            done += 1
        else:
            bad.append(f"{d['name']} ({'offline' if not cur['online'] else 'failed'})")
    word = "on" if state else "off"
    msg = f"{done} of {len(devs)} {word}." + (f" Not done: {', '.join(bad)}." if bad else "")
    summary = {"ok": not bad, "message": msg, "done": done, "total": len(devs), "not_done": bad}
    ms = round((time.perf_counter() - t0) * 1000)
    store().ledger_put(cid, {"summary": summary, "planned": [d["name"] for d in devs],
                             "verified_on": [after[d["device_id"]]["name"] for d in devs
                                             if after[d["device_id"]]["online"] and after[d["device_id"]]["on"] == state],
                             "retried": retried, "routine_created": False, "ms": ms})
    return {**summary, "command_id": cid, "ms": ms}


def tool_naive_set_group_state(a):
    """Control experiment: fire commands, never verify, always say Done."""
    t0 = time.perf_counter()
    target, state = _str(a, "target"), _bool(a, "state")
    prov = provider()
    devs = _match(prov.list(), target)
    if not devs:
        return {"ok": False, "error": f"Unknown target '{target}'"}
    _send_all(prov, devs, state, 1)
    return {"ok": True, "message": "Done!", "ms": round((time.perf_counter() - t0) * 1000)}


def _cron(rec, dt):
    if rec == "daily":
        return f"cron({dt.minute} {dt.hour} * * ? *)"
    if rec == "weekdays":
        return f"cron({dt.minute} {dt.hour} ? * MON-FRI *)"
    dow = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][dt.weekday()]
    return f"cron({dt.minute} {dt.hour} ? * {dow} *)"


def tool_schedule_action(a):
    target, state = _str(a, "target"), _bool(a, "state")
    when_iso = _str(a, "when_iso")
    tz = a.get("timezone") or os.environ.get("DEFAULT_TZ", "UTC")
    rec = str(a.get("recurrence", "once")).lower()
    confirmed = a.get("confirmed") is True
    try:
        when = datetime.fromisoformat(when_iso).replace(tzinfo=None)
    except ValueError:
        return {"ok": False, "error": "when_iso must be ISO 8601 local time, e.g. 2026-10-24T07:00:00"}
    if not _match(provider().list(), target):
        return {"ok": False, "error": f"Unknown target '{target}'"}
    if rec in RECURRING and a.get("user_said_recurring") is not True:
        rec = "once"  # recurrence guard: never infer a routine
    if rec != "once" and rec not in RECURRING:
        rec = "once"
    pid = hashlib.sha1(f"{target.lower()}|{state}|{when_iso}|{rec}|{tz}".encode()).hexdigest()[:10]
    plan = store().plan_get(pid)
    if not confirmed:
        store().plan_put(pid, {"target": target, "state": state, "when": when_iso, "recurrence": rec, "tz": tz, "status": "pending_confirmation"})
        kind = "ONE TIME" if rec == "once" else f"RECURRING ({rec})"
        return {"ok": True, "needs_confirmation": True, "plan_id": pid,
                "message": f"{kind}: {target} {'on' if state else 'off'} at {when:%a %d %b %H:%M} ({tz}). Not a routine unless recurring. Confirm?"}
    if not plan:
        return {"ok": False, "error": "No pending plan. Call without confirmed first."}
    if plan.get("status") == "scheduled":
        return {"ok": True, "message": "Already scheduled.", "plan_id": pid, "routine_created": rec != "once", "duplicate": True}
    expr = f"at({when:%Y-%m-%dT%H:%M:%S})" if rec == "once" else _cron(rec, when)
    kwargs = dict(Name=f"hg-{pid}", ScheduleExpression=expr, ScheduleExpressionTimezone=tz,
                  FlexibleTimeWindow={"Mode": "OFF"},
                  Target={"Arn": os.environ["FUNCTION_ARN"], "RoleArn": os.environ["SCHEDULER_ROLE_ARN"],
                          "Input": json.dumps({"scheduled_plan": {"plan_id": pid, "target": target, "state": state, "recurrence": rec}})})
    if rec == "once":
        kwargs["ActionAfterCompletion"] = "DELETE"
    scheduler().create_schedule(**kwargs)
    plan["status"] = "scheduled"; plan["expression"] = expr
    store().plan_put(pid, plan)
    return {"ok": True, "message": "Scheduled.", "plan_id": pid, "expression": expr, "routine_created": rec != "once"}


def tool_get_ledger(a):
    cid = _str(a, "command_id")
    rec = store().ledger_get(cid)
    if not rec:
        return {"ok": False, "error": "Unknown command_id"}
    return {"ok": True, "command_id": cid, "planned": len(rec["planned"]), "verified_on": len(rec["verified_on"]),
            "retried": rec["retried"], "routine_created": rec["routine_created"], "ms": rec["ms"],
            "summary": rec["summary"]["message"]}


def tool_demo_set_online(a):
    if os.environ.get("DEMO_MODE") != "true":
        return {"ok": False, "error": "demo tools disabled"}
    name, online = _str(a, "device").lower(), _bool(a, "online")
    for d in store().devices_all():
        if d["name"].lower() == name or d["device_id"] == name:
            d = dict(d); d["online"] = online
            store().device_put(d)
            return {"ok": True, "device": d["name"], "online": online}
    return {"ok": False, "error": "Unknown device"}


def tool_demo_reset(a):
    if os.environ.get("DEMO_MODE") != "true":
        return {"ok": False, "error": "demo tools disabled"}
    for d in store().devices_all():
        store().device_delete(d["device_id"])
    for d in SEED:
        store().device_put(dict(d))
    return {"ok": True, "message": "Virtual home reset."}


S = lambda desc: {"type": "string", "description": desc}
B = lambda desc: {"type": "boolean", "description": desc}
TOOLS = {
    "list_devices": (tool_list_devices, "List devices with online and on/off state.", {"type": "object", "properties": {}}),
    "set_group_state": (tool_set_group_state, "Turn a device or room on or off. Runs every device, verifies real state, retries failures once, returns one result.",
                        {"type": "object", "properties": {"target": S("Room or device name"), "state": B("true=on, false=off"), "command_id": S("Optional idempotency key")},
                         "required": ["target", "state"]}),
    "naive_set_group_state": (tool_naive_set_group_state, "Control experiment: sends commands with no verification and no retry.",
                             {"type": "object", "properties": {"target": S("Room or device name"), "state": B("true=on, false=off")}, "required": ["target", "state"]}),
    "schedule_action": (tool_schedule_action, "Schedule one action. One-time unless the user explicitly said daily, weekly or weekdays. Call first without confirmed, then with confirmed=true after the user agrees.",
                        {"type": "object", "properties": {"target": S("Room or device"), "state": B("true=on"), "when_iso": S("Local ISO time, e.g. 2026-10-24T07:00:00"),
                                                          "recurrence": {"type": "string", "enum": ["once", "daily", "weekly", "weekdays"]},
                                                          "user_said_recurring": B("true only if the user explicitly asked for repetition"),
                                                          "confirmed": B("true after user confirmation"), "timezone": S("IANA timezone, optional")},
                         "required": ["target", "state", "when_iso"]}),
    "get_ledger": (tool_get_ledger, "Planned vs verified results, retries, and whether any routine was created.",
                   {"type": "object", "properties": {"command_id": S("Command id")}, "required": ["command_id"]}),
}
DEMO_TOOLS = {
    "demo_set_online": (tool_demo_set_online, "Demo only: simulate a device going offline or online.",
                        {"type": "object", "properties": {"device": S("Device name"), "online": B("online?")}, "required": ["device", "online"]}),
    "demo_reset": (tool_demo_reset, "Demo only: reset the virtual home.", {"type": "object", "properties": {}}),
}


def _tools():
    t = dict(TOOLS)
    if os.environ.get("DEMO_MODE") == "true" and os.environ.get("DEVICE_PROVIDER", "virtual") == "virtual":
        t.update(DEMO_TOOLS)
    return t


# ---------------------------------------------------------------- MCP / JSON-RPC
def _err(i, code, msg): return {"jsonrpc": "2.0", "id": i, "error": {"code": code, "message": msg}}


def handle(msg):
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
        return _err(None, -32600, "Invalid Request")
    i, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
    if "id" not in msg:
        return None  # notification
    if method == "initialize":
        v = params.get("protocolVersion")
        return {"jsonrpc": "2.0", "id": i, "result": {
            "protocolVersion": v if v in SUPPORTED else SUPPORTED[0],
            "capabilities": {"tools": {"listChanged": False}}, "serverInfo": SERVER_INFO,
            "instructions": "Execute household commands once, completely, and verified. Never create routines unless asked."}}
    if method == "ping":
        return {"jsonrpc": "2.0", "id": i, "result": {}}
    tools = _tools()
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": i, "result": {"tools": [
            {"name": n, "description": d, "inputSchema": s} for n, (_, d, s) in tools.items()]}}
    if method == "tools/call":
        name, args = params.get("name"), params.get("arguments") or {}
        if name not in tools:
            return _err(i, -32602, f"Unknown tool: {name}")
        try:
            out = tools[name][0](args)
            is_err = out.get("ok") is False
        except ValueError as e:
            out, is_err = {"ok": False, "error": str(e)}, True
        except Exception as e:  # never leak internals
            print("tool error", name, repr(e))
            out, is_err = {"ok": False, "error": "internal error"}, True
        return {"jsonrpc": "2.0", "id": i, "result": {"content": [{"type": "text", "text": json.dumps(out)}],
                                                     "structuredContent": out, "isError": is_err}}
    return _err(i, -32601, f"Method not found: {method}")


def _resp(code, body, headers=None):
    h = {"Content-Type": "application/json"}
    h.update(headers or {})
    return {"statusCode": code, "headers": h, "body": json.dumps(body) if body is not None else ""}


def _authorized(headers):
    token = os.environ.get("MCP_TOKEN", "")
    if not token:
        return False  # fail closed
    got = headers.get("authorization", "")
    return got.lower().startswith("bearer ") and hmac.compare_digest(got[7:].strip(), token)


def run_scheduled(plan):
    cid = f"sched-{plan['plan_id']}" if plan.get("recurrence") == "once" else None
    out = tool_set_group_state({"target": plan["target"], "state": plan["state"], **({"command_id": cid} if cid else {})})
    print("scheduled run", json.dumps(out))
    return out


def lambda_handler(event, context):
    if "scheduled_plan" in event:
        return run_scheduled(event["scheduled_plan"])
    http = (event.get("requestContext") or {}).get("http") or {}
    method, path = http.get("method", "POST"), event.get("rawPath", "/")
    if path.startswith("/.well-known"):
        return _resp(404, {"error": "OAuth metadata not implemented in this build"})
    if method != "POST":
        return _resp(405, {"error": "method not allowed"}, {"Allow": "POST"})
    if not _authorized({k.lower(): v for k, v in (event.get("headers") or {}).items()}):
        return _resp(401, {"error": "unauthorized"})  # intentionally no WWW-Authenticate header
    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode()
    try:
        msg = json.loads(body)
    except json.JSONDecodeError:
        return _resp(400, _err(None, -32700, "Parse error"))
    if isinstance(msg, list):
        outs = [o for o in (handle(m) for m in msg) if o is not None]
        return _resp(200, outs) if outs else {"statusCode": 202, "headers": {}, "body": ""}
    out = handle(msg)
    return {"statusCode": 202, "headers": {}, "body": ""} if out is None else _resp(200, out)

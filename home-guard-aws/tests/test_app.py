import json, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
os.environ.update(MCP_TOKEN="t0k", DEMO_MODE="true", FUNCTION_ARN="arn:fn", SCHEDULER_ROLE_ARN="arn:role", DEFAULT_TZ="UTC")
import app


class FakeStore:
    def __init__(self): self.d, self.l, self.p = {}, {}, {}
    def devices_all(self): return [dict(v) for v in self.d.values()]
    def device_put(self, x): self.d[x["device_id"]] = dict(x)
    def device_delete(self, i): self.d.pop(i, None)
    def ledger_get(self, c): return self.l.get(c)
    def ledger_put(self, c, r): self.l[c] = r
    def plan_get(self, p): return self.p.get(p)
    def plan_put(self, p, r): self.p[p] = r


class FakeSched:
    calls = []
    def create_schedule(self, **kw): self.calls.append(kw)


def setup_function(_):
    app.STORE, app.SCHED, app.PROVIDER = FakeStore(), FakeSched(), None
    FakeSched.calls = []


def rpc(method, params=None, token="t0k", i=1):
    ev = {"requestContext": {"http": {"method": "POST"}}, "rawPath": "/mcp",
          "headers": {"Authorization": f"Bearer {token}"} if token else {},
          "body": json.dumps({"jsonrpc": "2.0", "id": i, "method": method, "params": params or {}})}
    return app.lambda_handler(ev, None)


def call(name, args):
    r = rpc("tools/call", {"name": name, "arguments": args})
    assert r["statusCode"] == 200
    return json.loads(r["body"])["result"]["structuredContent"]


def test_auth_and_init():
    r = rpc("initialize", {"protocolVersion": "2025-11-25"}, token=None)
    assert r["statusCode"] == 401 and "WWW-Authenticate" not in r["headers"]
    r = rpc("initialize", {"protocolVersion": "2025-11-25"})
    assert json.loads(r["body"])["result"]["protocolVersion"] == "2025-11-25"
    names = [t["name"] for t in json.loads(rpc("tools/list")["body"])["result"]["tools"]]
    assert "set_group_state" in names and "demo_set_online" in names


def test_group_execution_retry_and_dedupe():
    call("demo_reset", {})
    call("demo_set_online", {"device": "Floor lamp", "online": False})
    r = call("set_group_state", {"target": "living room", "state": True})
    assert r["done"] == 4 and r["total"] == 5 and "Floor lamp (offline)" in r["not_done"][0]
    assert call("get_ledger", {"command_id": r["command_id"]})["retried"] == ["Fan"]
    assert call("set_group_state", {"target": "living room", "state": True})["duplicate"] is True


def test_naive_says_done_but_reality_differs():
    call("demo_reset", {})
    assert call("naive_set_group_state", {"target": "living room", "state": True})["message"] == "Done!"
    on = [d for d in call("list_devices", {})["devices"] if d["group"] == "living room" and d["on"]]
    assert len(on) == 4  # flaky fan failed silently


def test_recurrence_guard_and_schedule():
    call("demo_reset", {})
    a = {"target": "bedroom", "state": True, "when_iso": "2026-10-24T07:00:00", "recurrence": "daily"}
    r = call("schedule_action", a)
    assert r["needs_confirmation"] and r["message"].startswith("ONE TIME")
    r = call("schedule_action", {**a, "confirmed": True})
    assert r["routine_created"] is False and FakeSched.calls[0]["ScheduleExpression"].startswith("at(")
    assert FakeSched.calls[0]["ActionAfterCompletion"] == "DELETE"


def test_explicit_recurrence_allowed():
    call("demo_reset", {})
    a = {"target": "bedroom", "state": True, "when_iso": "2026-10-24T07:00:00", "recurrence": "daily", "user_said_recurring": True}
    call("schedule_action", a)
    assert call("schedule_action", {**a, "confirmed": True})["routine_created"] is True


def test_latency_budget():
    call("demo_reset", {})
    t = time.perf_counter(); call("set_group_state", {"target": "living room", "state": True})
    assert (time.perf_counter() - t) < 0.5


def test_bad_input():
    r = json.loads(rpc("tools/call", {"name": "set_group_state", "arguments": {"target": "x"}})["body"])["result"]
    assert r["isError"] is True

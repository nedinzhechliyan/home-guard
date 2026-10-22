"""
Home Guard - MCP Backend Unit Test Suite
Uses a recorded-response test double ONLY inside tests (never in app code).
Compatible with both pytest and python3 -m unittest.
"""

import unittest
import json
import os
import sys

# Ensure backend directory is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from device_provider import DeviceProvider
from mcp_handler import handle_mcp_request
from tools import (
    tool_list_devices,
    tool_set_group_state,
    tool_naive_set_group_state,
    tool_schedule_action,
    tool_get_ledger,
)


class RecordedResponseTestDouble(DeviceProvider):
    """
    Test double ONLY used inside unit tests.
    Simulates real hardware responses recorded from LIFX / Home Assistant:
    5 lights in Living Room:
    - 4 are online (ceiling 1, ceiling 2, couch lamp, reading nook)
    - 1 is offline (Floor lamp)
    - couch lamp fails on first attempt and succeeds on retry.
    """

    def __init__(self):
        self.devices = [
            {"id": "d1", "name": "Living Room Ceiling 1", "group": "Living Room", "online": True, "on": False, "brightness": 1.0},
            {"id": "d2", "name": "Living Room Ceiling 2", "group": "Living Room", "online": True, "on": False, "brightness": 1.0},
            {"id": "d3", "name": "Couch Lamp", "group": "Living Room", "online": True, "on": False, "brightness": 0.8},
            {"id": "d4", "name": "Reading Nook", "group": "Living Room", "online": True, "on": False, "brightness": 0.5},
            {"id": "d5", "name": "Floor Lamp", "group": "Living Room", "online": False, "on": False, "brightness": 1.0},
        ]
        self.power_attempts = {}

    def list_devices(self):
        return [dict(d) for d in self.devices]

    def set_power(self, device_id: str, state: bool) -> bool:
        self.power_attempts[device_id] = self.power_attempts.get(device_id, 0) + 1
        # Couch lamp fails on first call, succeeds on retry
        if device_id == "d3" and self.power_attempts[device_id] == 1:
            return False

        for d in self.devices:
            if d["id"] == device_id and d["online"]:
                d["on"] = state
                return True
        return False

    def read_state(self):
        return [dict(d) for d in self.devices]


class TestHomeGuardMCP(unittest.TestCase):
    def setUp(self):
        self.test_provider = RecordedResponseTestDouble()
        # Set DEV_STATIC_TOKEN for authenticated test calls
        os.environ["DEV_STATIC_TOKEN"] = "test-secret-token"

    def test_unauthenticated_request_returns_401_without_www_authenticate(self):
        """
        Acceptance Check 4:
        Unauthenticated POST to /mcp returns 401 without WWW-Authenticate header.
        """
        status_code, headers, body = handle_mcp_request(
            http_method="POST",
            path="/mcp",
            headers={"Content-Type": "application/json"},
            body_str=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}),
        )
        self.assertEqual(status_code, 401)
        self.assertNotIn("www-authenticate", [k.lower() for k in headers.keys()])
        resp_json = json.loads(body)
        self.assertIn("error", resp_json)

    def test_get_and_delete_on_mcp_returns_405(self):
        """
        Streamable HTTP specification: GET and DELETE on /mcp return 405 Method Not Allowed.
        """
        status_code, headers, body = handle_mcp_request(
            http_method="GET",
            path="/mcp",
            headers={},
            body_str="",
        )
        self.assertEqual(status_code, 405)
        self.assertEqual(headers.get("Allow"), "POST")

        status_code, headers, body = handle_mcp_request(
            http_method="DELETE",
            path="/mcp",
            headers={},
            body_str="",
        )
        self.assertEqual(status_code, 405)

    def test_initialize_and_tools_list_handshake(self):
        """
        MCP Handshake protocol test (Spec 2025-11-25).
        """
        # Step 1: initialize
        status_code, headers, body = handle_mcp_request(
            http_method="POST",
            path="/mcp",
            headers={"Authorization": "Bearer test-secret-token"},
            body_str=json.dumps({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {"protocolVersion": "2025-11-25"},
            }),
        )
        self.assertEqual(status_code, 200)
        data = json.loads(body)
        self.assertEqual(data["result"]["protocolVersion"], "2025-11-25")
        self.assertEqual(data["result"]["serverInfo"]["name"], "home-guard-mcp")

        # Step 2: notifications/initialized
        status_code, headers, body = handle_mcp_request(
            http_method="POST",
            path="/mcp",
            headers={"Authorization": "Bearer test-secret-token"},
            body_str=json.dumps({
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
            }),
        )
        self.assertEqual(status_code, 202)

        # Step 3: tools/list
        status_code, headers, body = handle_mcp_request(
            http_method="POST",
            path="/mcp",
            headers={"Authorization": "Bearer test-secret-token"},
            body_str=json.dumps({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list",
                "params": {},
            }),
        )
        self.assertEqual(status_code, 200)
        tools_data = json.loads(body)
        tool_names = [t["name"] for t in tools_data["result"]["tools"]]
        self.assertIn("list_devices", tool_names)
        self.assertIn("set_group_state", tool_names)
        self.assertIn("naive_set_group_state", tool_names)
        self.assertIn("schedule_action", tool_names)
        self.assertIn("get_ledger", tool_names)

    def test_rule_5_daily_without_explicit_wording_forced_to_one_time(self):
        """
        Acceptance Check 5:
        A 'daily' request without explicit user wording is forced to one-time.
        """
        res = tool_schedule_action(
            target="living room",
            state=True,
            when_iso="2026-10-23T20:00:00Z",
            recurrence="daily",
            user_said_recurring=False,  # User did not explicitly say recurring words!
            confirmed=False,
        )
        self.assertTrue(res["needs_confirmation"])
        self.assertEqual(res["recurrence"], "once")
        self.assertIn("ONE TIME", res["message"])
        self.assertIn("Not a routine", res["message"])

    def test_rule_5_daily_with_explicit_wording_allowed(self):
        """
        When user explicitly says 'every day', recurrence is preserved.
        """
        res = tool_schedule_action(
            target="living room",
            state=True,
            when_iso="2026-10-23T20:00:00Z",
            recurrence="daily",
            user_said_recurring=True,
            confirmed=False,
        )
        self.assertTrue(res["needs_confirmation"])
        self.assertEqual(res["recurrence"], "daily")
        self.assertIn("RECURRING", res["message"])

    def test_set_group_state_contract_and_retry(self):
        """
        Verifies:
        - Skips offline devices (Floor Lamp is offline).
        - Executes online devices in parallel.
        - Retries online failure once (Couch Lamp succeeds on retry).
        - Returns exact machine-clean output: '4 of 5 on. Not done: Floor Lamp (offline).'
        """
        res = tool_set_group_state(
            target="Living Room",
            state=True,
            command_id="cmd_test_001",
            provider=self.test_provider,
        )
        self.assertFalse(res["ok"])  # 4 of 5 is not 100% complete
        self.assertEqual(res["done"], 4)
        self.assertEqual(res["total"], 5)
        self.assertIn("Floor Lamp (offline)", res["not_done"])
        self.assertEqual(res["message"], "4 of 5 on. Not done: Floor Lamp (offline).")
        self.assertGreater(res["ms"], 0)

        # Verify retry took place for Couch lamp
        self.assertEqual(self.test_provider.power_attempts["d3"], 2)

    def test_idempotency_duplicate_command_id(self):
        """
        Calling set_group_state with the same command_id returns duplicate=True.
        """
        cid = "cmd_idempotency_123"
        first_call = tool_set_group_state(
            target="Living Room",
            state=True,
            command_id=cid,
            provider=self.test_provider,
        )
        self.assertFalse(first_call.get("duplicate", False))

        # Second call with identical command_id
        second_call = tool_set_group_state(
            target="Living Room",
            state=True,
            command_id=cid,
            provider=self.test_provider,
        )
        self.assertTrue(second_call.get("duplicate", False))
        self.assertEqual(second_call["command_id"], cid)

    def test_naive_set_group_state_always_returns_done(self):
        """
        Control experiment: naive_set_group_state always returns {"message": "Done!"}
        despite offline device failure.
        """
        res = tool_naive_set_group_state(
            target="Living Room",
            state=True,
            provider=self.test_provider,
        )
        self.assertEqual(res, {"message": "Done!"})

    def test_get_ledger_retrieval(self):
        """
        Ledger retrieval for executed command.
        """
        cid = "cmd_ledger_verify"
        tool_set_group_state(
            target="Living Room",
            state=True,
            command_id=cid,
            provider=self.test_provider,
        )
        ledger = tool_get_ledger(cid)
        self.assertEqual(ledger["command_id"], cid)
        self.assertEqual(ledger["planned"], 5)
        self.assertEqual(ledger["verified_on"], 4)
        self.assertIn("Couch Lamp", ledger["retried"])
        self.assertFalse(ledger["routine_created"])


if __name__ == "__main__":
    unittest.main()

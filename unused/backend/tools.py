"""
Home Guard - MCP Tools Implementation
Strict JSON schemas, machine-clean outputs, parallel device execution (<500ms),
verified readback, and bounded retry.
"""

import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, List, Optional, Tuple

from device_provider import DeviceProvider, get_device_provider
from storage import get_storage
from scheduler import create_eventbridge_schedule

# Strict JSON Schemas for tools/list
TOOL_DEFINITIONS = [
    {
        "name": "list_devices",
        "description": "Lists all smart devices from the connected provider with real verified states.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
    },
    {
        "name": "set_group_state",
        "description": "Executes household group power state once with verification, 1-bounded retry on online failures, and DynamoDB conditional idempotency.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "target": {
                    "type": "string",
                    "description": "Target room, group name, or device name (e.g. 'living room', 'all').",
                },
                "state": {
                    "type": "boolean",
                    "description": "Desired power state: true for ON, false for OFF.",
                },
                "command_id": {
                    "type": "string",
                    "description": "Optional unique client command ID for idempotency deduplication.",
                },
            },
            "required": ["target", "state"],
            "additionalProperties": False,
        },
    },
    {
        "name": "naive_set_group_state",
        "description": "Control experiment: fire-and-forget state change without readback verification or retries. Always returns 'Done!'.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "target": {
                    "type": "string",
                    "description": "Target room or device.",
                },
                "state": {
                    "type": "boolean",
                    "description": "Desired power state.",
                },
            },
            "required": ["target", "state"],
            "additionalProperties": False,
        },
    },
    {
        "name": "schedule_action",
        "description": "Creates a verified scheduled action. Requires explicit confirmation and guards against unwanted routines.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "target": {"type": "string"},
                "state": {"type": "boolean"},
                "when_iso": {"type": "string", "description": "ISO-8601 target execution timestamp."},
                "recurrence": {
                    "type": "string",
                    "enum": ["once", "daily", "weekly", "weekdays"],
                    "default": "once",
                },
                "user_said_recurring": {
                    "type": "boolean",
                    "default": False,
                    "description": "True only if user explicitly uttered recurrence keywords.",
                },
                "confirmed": {
                    "type": "boolean",
                    "default": False,
                    "description": "Pass true on second call after receiving needs_confirmation.",
                },
                "plan_id": {
                    "type": "string",
                    "description": "Plan ID returned in the needs_confirmation step.",
                },
            },
            "required": ["target", "state", "when_iso"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_ledger",
        "description": "Retrieves the verification audit ledger for a given command_id from DynamoDB.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "command_id": {
                    "type": "string",
                    "description": "The command_id to query.",
                },
            },
            "required": ["command_id"],
            "additionalProperties": False,
        },
    },
]


def tool_list_devices(provider: Optional[DeviceProvider] = None) -> List[Dict[str, Any]]:
    """Tool 1: list_devices"""
    prov = provider or get_device_provider()
    return prov.list_devices()


def tool_naive_set_group_state(
    target: str,
    state: bool,
    provider: Optional[DeviceProvider] = None
) -> Dict[str, Any]:
    """
    Tool 3: naive_set_group_state
    Control experiment: fire-and-forget without verification or retry.
    Always returns {"message": "Done!"}.
    """
    prov = provider or get_device_provider()
    devices = prov.list_devices()

    norm_target = target.lower().strip()
    matched = [
        d for d in devices
        if norm_target in ("all", "all lights")
        or norm_target in d["group"].lower()
        or norm_target in d["name"].lower()
    ]

    # Fire commands without waiting or verifying
    with ThreadPoolExecutor(max_workers=5) as pool:
        for d in matched:
            pool.submit(prov.set_power, d["id"], state)

    return {"message": "Done!"}


def tool_set_group_state(
    target: str,
    state: bool,
    command_id: Optional[str] = None,
    provider: Optional[DeviceProvider] = None
) -> Dict[str, Any]:
    """
    Tool 2: set_group_state
    Idempotent, atomic verification, 1 bounded retry on online failures, skips offline devices.
    Returns: {ok, message, done, total, not_done, command_id, ms, duplicate?}
    """
    start_time = time.perf_counter()
    storage = get_storage()
    prov = provider or get_device_provider()

    cid = command_id or f"cmd_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}"

    # 1. Idempotency Check: check if same command_id already recorded
    existing_ledger = storage.get_ledger(cid)
    if existing_ledger:
        return {
            "ok": existing_ledger.get("verified_on", 0) == existing_ledger.get("planned", 0),
            "message": existing_ledger.get("summary", ""),
            "done": existing_ledger.get("verified_on", 0),
            "total": existing_ledger.get("planned", 0),
            "not_done": existing_ledger.get("not_done", []),
            "command_id": cid,
            "ms": round((time.perf_counter() - start_time) * 1000, 1),
            "duplicate": True,
        }

    # Also check 30s window duplicate
    recent = storage.find_recent_duplicate(target, state, window_seconds=30)
    if recent and not command_id:
        return {
            "ok": recent.get("verified_on", 0) == recent.get("planned", 0),
            "message": recent.get("summary", ""),
            "done": recent.get("verified_on", 0),
            "total": recent.get("planned", 0),
            "not_done": recent.get("not_done", []),
            "command_id": recent.get("command_id", cid),
            "ms": round((time.perf_counter() - start_time) * 1000, 1),
            "duplicate": True,
        }

    # 2. Resolve every device in target
    devices = prov.list_devices()
    norm_target = target.lower().strip()

    target_devices = [
        d for d in devices
        if norm_target in ("all", "all lights")
        or norm_target in d["group"].lower()
        or norm_target in d["name"].lower()
    ]

    total_count = len(target_devices)
    if total_count == 0:
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)
        res = {
            "ok": False,
            "message": f"No devices found matching '{target}'.",
            "done": 0,
            "total": 0,
            "not_done": [],
            "command_id": cid,
            "ms": elapsed_ms,
        }
        return res

    # 3. Categorize into online vs offline
    online_devices = [d for d in target_devices if d.get("online", False)]
    offline_devices = [d for d in target_devices if not d.get("online", False)]

    # 4. Dispatch power changes to online devices in parallel (<500ms round-trip budget)
    retried_names: List[str] = []

    def dispatch_power(dev: Dict[str, Any]) -> Tuple[str, bool]:
        success = prov.set_power(dev["id"], state)
        return dev["name"], success

    with ThreadPoolExecutor(max_workers=min(12, len(online_devices) or 1)) as pool:
        futures = {pool.submit(dispatch_power, d): d for d in online_devices}
        for f in as_completed(futures):
            f.result()

    # 5. Read back real state with ONE single list call
    readback_devices = {d["id"]: d for d in prov.read_state()}

    # 6. Check for online failures and perform bounded retry (only once)
    failed_online: List[Dict[str, Any]] = []
    for d in online_devices:
        current = readback_devices.get(d["id"])
        # If device did not reach expected state, queue for 1 bounded retry
        if not current or current.get("on") != state:
            failed_online.append(d)

    if failed_online:
        with ThreadPoolExecutor(max_workers=min(6, len(failed_online))) as retry_pool:
            retry_futures = {retry_pool.submit(dispatch_power, d): d for d in failed_online}
            for rf in as_completed(retry_futures):
                rf.result()
        # Log retried device names
        retried_names = [d["name"] for d in failed_online]

        # Final readback
        readback_devices = {d["id"]: d for d in prov.read_state()}

    # 7. Final status tally
    done_count = 0
    not_done_items: List[str] = []

    for d in target_devices:
        current = readback_devices.get(d["id"])
        if not d.get("online", False):
            not_done_items.append(f"{d['name']} (offline)")
        elif current and current.get("on") == state:
            done_count += 1
        else:
            not_done_items.append(f"{d['name']} (unresponsive)")

    # 8. Build short, precise message
    state_word = "on" if state else "off"
    if done_count == total_count:
        summary_msg = f"{done_count} of {total_count} {state_word}."
    else:
        not_done_str = ", ".join(not_done_items)
        summary_msg = f"{done_count} of {total_count} {state_word}. Not done: {not_done_str}."

    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)

    # 9. Store in DynamoDB ledger with conditional write
    ledger_record = {
        "command_id": cid,
        "target": target,
        "state": state,
        "planned": total_count,
        "verified_on": done_count,
        "retried": retried_names,
        "not_done": not_done_items,
        "routine_created": False,
        "ms": elapsed_ms,
        "summary": summary_msg,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    is_new, saved = storage.put_ledger(ledger_record)

    return {
        "ok": done_count == total_count,
        "message": summary_msg,
        "done": done_count,
        "total": total_count,
        "not_done": not_done_items,
        "command_id": cid,
        "ms": elapsed_ms,
        "duplicate": not is_new,
    }


def tool_schedule_action(
    target: str,
    state: bool,
    when_iso: str,
    recurrence: str = "once",
    user_said_recurring: bool = False,
    confirmed: bool = False,
    plan_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Tool 4: schedule_action
    Hard Rule 5: A "daily" request without explicit user wording is forced to one-time.
    First call returns {needs_confirmation: true, plan_id, message: "... Not a routine. Confirm?"}.
    Second call with confirmed=true creates real EventBridge Scheduler schedule.
    """
    storage = get_storage()

    # Rule 5 check: Force to "once" unless user explicitly uttered recurrence keywords
    effective_recurrence = recurrence
    if recurrence in ("daily", "weekly", "weekdays") and not user_said_recurring:
        effective_recurrence = "once"

    pid = plan_id or f"plan_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}"
    state_verb = "on" if state else "off"

    if not confirmed:
        # Save proposed plan in DynamoDB
        plan_doc = {
            "plan_id": pid,
            "target": target,
            "state": state,
            "when_iso": when_iso,
            "recurrence": effective_recurrence,
            "user_said_recurring": user_said_recurring,
            "confirmed": False,
        }
        storage.put_schedule_plan(plan_doc)

        # Confirm message explicitly stating whether routine or one-time
        if effective_recurrence == "once":
            msg = f"ONE TIME: Turn {state_verb} {target} at {when_iso}. Not a routine. Confirm?"
        else:
            msg = f"RECURRING ({effective_recurrence}): Turn {state_verb} {target} at {when_iso}. Confirm?"

        return {
            "needs_confirmation": True,
            "plan_id": pid,
            "message": msg,
            "target": target,
            "state": state,
            "when_iso": when_iso,
            "recurrence": effective_recurrence,
            "user_said_recurring": user_said_recurring,
        }

    # Confirmed = True: create EventBridge schedule
    existing_plan = storage.get_schedule_plan(pid) or {}
    final_target = existing_plan.get("target", target)
    final_state = existing_plan.get("state", state)
    final_when = existing_plan.get("when_iso", when_iso)
    final_recurrence = existing_plan.get("recurrence", effective_recurrence)

    sched_res = create_eventbridge_schedule(
        plan_id=pid,
        target=final_target,
        state=final_state,
        when_iso=final_when,
        recurrence=final_recurrence,
    )

    confirmed_plan = {
        "plan_id": pid,
        "target": final_target,
        "state": final_state,
        "when_iso": final_when,
        "recurrence": final_recurrence,
        "confirmed": True,
        "schedule_name": sched_res["schedule_name"],
        "schedule_arn": sched_res["schedule_arn"],
    }
    storage.put_schedule_plan(confirmed_plan)

    return {
        "confirmed": True,
        "plan_id": pid,
        "schedule_name": sched_res["schedule_name"],
        "message": f"Schedule active: Turn {state_verb} {final_target} at {final_when} ({final_recurrence}).",
        "routine_created": final_recurrence != "once",
    }


def tool_get_ledger(command_id: str) -> Dict[str, Any]:
    """
    Tool 5: get_ledger
    Returns planned count, verified_on, retried device names, routine_created boolean, ms, summary from DynamoDB.
    """
    storage = get_storage()
    entry = storage.get_ledger(command_id)
    if not entry:
        raise ValueError(f"No ledger record found for command_id '{command_id}'")

    return {
        "command_id": entry.get("command_id", command_id),
        "target": entry.get("target", ""),
        "state": entry.get("state", False),
        "planned": entry.get("planned", 0),
        "verified_on": entry.get("verified_on", 0),
        "retried": entry.get("retried", []),
        "routine_created": entry.get("routine_created", False),
        "ms": entry.get("ms", 0.0),
        "summary": entry.get("summary", ""),
        "duplicate": entry.get("duplicate", False),
        "timestamp": entry.get("timestamp", ""),
    }

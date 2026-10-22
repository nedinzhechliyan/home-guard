"""
Home Guard - Scheduled Action Executor Lambda
Invoked by AWS EventBridge Scheduler when the scheduled time triggers.
Executes set_group_state with verification and records execution in DynamoDB.
"""

import json
import logging
from typing import Dict, Any

from tools import tool_set_group_state
from storage import get_storage

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    EventBridge Scheduler execution entry point.
    Receives JSON payload: {plan_id, target, state, scheduled_time, recurrence}
    """
    logger.info("EventBridge execution event received: %s", json.dumps(event))

    plan_id = event.get("plan_id", "sched_unknown")
    target = event.get("target", "living room")
    state = bool(event.get("state", False))

    command_id = f"exec_{plan_id}"

    # Execute group state using same contract logic
    result = tool_set_group_state(
        target=target,
        state=state,
        command_id=command_id,
    )

    # Update plan status in DynamoDB
    storage = get_storage()
    existing_plan = storage.get_schedule_plan(plan_id)
    if existing_plan:
        existing_plan["last_execution_result"] = result
        existing_plan["last_executed_at"] = result.get("timestamp")
        storage.put_schedule_plan(existing_plan)

    logger.info("Scheduled execution finished: %s", json.dumps(result))

    return {
        "status": "SUCCESS" if result.get("ok") else "PARTIAL",
        "result": result,
    }

"""
Home Guard - AWS EventBridge Scheduler Client
Creates real one-time at() or recurring cron schedules targeting executor Lambda.
"""

import os
import json
import datetime
from typing import Dict, Any, Optional

def _get_scheduler_client():
    try:
        import boto3
        region = os.environ.get("AWS_REGION", "us-east-1")
        return boto3.client("scheduler", region_name=region)
    except Exception:
        return None

def create_eventbridge_schedule(
    plan_id: str,
    target: str,
    state: bool,
    when_iso: str,
    recurrence: str = "once"
) -> Dict[str, Any]:
    """
    Creates an EventBridge Scheduler schedule:
    - One-time: uses at(yyyy-MM-ddTHH:mm:ss) with ActionAfterCompletion DELETE
    - Recurring: uses cron(...)
    Targets the executor Lambda with payload {target, state, plan_id}.
    """
    scheduler = _get_scheduler_client()
    executor_arn = os.environ.get("EXECUTOR_LAMBDA_ARN", "")
    role_arn = os.environ.get("SCHEDULER_ROLE_ARN", "")
    schedule_name = f"homeguard-{plan_id[:24]}"

    # Prepare schedule expression
    is_recurring = recurrence in ("daily", "weekly", "weekdays")
    expression = ""

    if is_recurring:
        if recurrence == "daily":
            expression = "cron(0 20 * * ? *)"  # default 8:00 PM daily
        elif recurrence == "weekdays":
            expression = "cron(0 20 ? * MON-FRI *)"
        elif recurrence == "weekly":
            expression = "cron(0 20 ? * SUN *)"
    else:
        # One-time ISO 8601 schedule
        try:
            # Format to AWS Scheduler at() expression without timezone suffix
            dt = datetime.datetime.fromisoformat(when_iso.replace("Z", "+00:00"))
            clean_iso = dt.strftime("%Y-%m-%dT%H:%M:%S")
            expression = f"at({clean_iso})"
        except Exception:
            clean_iso = when_iso.replace("Z", "").split(".")[0]
            expression = f"at({clean_iso})"

    payload = json.dumps({
        "plan_id": plan_id,
        "target": target,
        "state": state,
        "scheduled_time": when_iso,
        "recurrence": recurrence,
    })

    if scheduler and executor_arn and role_arn and os.environ.get("AWS_EXECUTION_ENV"):
        try:
            params: Dict[str, Any] = {
                "Name": schedule_name,
                "ScheduleExpression": expression,
                "ScheduleExpressionTimezone": os.environ.get("SCHEDULER_TIMEZONE", "UTC"),
                "FlexibleTimeWindow": {"Mode": "OFF"},
                "Target": {
                    "Arn": executor_arn,
                    "RoleArn": role_arn,
                    "Input": payload,
                    "RetryPolicy": {
                        "MaximumRetryAttempts": 2,
                        "MaximumEventAgeInSeconds": 300,
                    },
                },
            }
            if not is_recurring:
                params["ActionAfterCompletion"] = "DELETE"

            response = scheduler.create_schedule(**params)
            return {
                "schedule_arn": response.get("ScheduleArn", f"arn:aws:scheduler:{schedule_name}"),
                "schedule_name": schedule_name,
                "expression": expression,
            }
        except Exception as e:
            raise RuntimeError(f"EventBridge Scheduler API error: {e}")

    # Deterministic local / dry-run representation
    region = os.environ.get("AWS_REGION", "us-east-1")
    account_id = os.environ.get("AWS_ACCOUNT_ID", "123456789012")
    simulated_arn = f"arn:aws:scheduler:{region}:{account_id}:schedule/default/{schedule_name}"

    return {
        "schedule_arn": simulated_arn,
        "schedule_name": schedule_name,
        "expression": expression,
    }

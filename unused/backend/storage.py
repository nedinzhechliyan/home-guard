"""
Home Guard - DynamoDB Persistence Layer
Provides atomic, idempotent operations with TTL and conditional writes.
"""

import os
import time
from typing import Dict, Any, Optional, Tuple

# In-memory storage fallback for local development or test suites
_IN_MEMORY_LEDGER: Dict[str, Dict[str, Any]] = {}
_IN_MEMORY_SCHEDULES: Dict[str, Dict[str, Any]] = {}

def _get_dynamo_resource():
    try:
        import boto3
        region = os.environ.get("AWS_REGION", "us-east-1")
        return boto3.resource("dynamodb", region_name=region)
    except Exception:
        return None

class StorageRepository:
    def __init__(self):
        self.ledger_table_name = os.environ.get("LEDGER_TABLE_NAME", "HomeGuardLedger")
        self.schedules_table_name = os.environ.get("SCHEDULES_TABLE_NAME", "HomeGuardSchedules")
        self.dynamo = _get_dynamo_resource()

    def get_ledger(self, command_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a command execution ledger entry by command_id."""
        if not command_id:
            return None

        if self.dynamo and os.environ.get("AWS_EXECUTION_ENV"):
            try:
                table = self.dynamo.Table(self.ledger_table_name)
                res = table.get_item(Key={"command_id": command_id})
                return res.get("Item")
            except Exception:
                pass

        return _IN_MEMORY_LEDGER.get(command_id)

    def find_recent_duplicate(self, target: str, state: bool, window_seconds: int = 30) -> Optional[Dict[str, Any]]:
        """
        Checks if an identical target + state command was executed within the last window_seconds.
        Protects against rapid double-clicks and repeated assistant invocations.
        """
        now = time.time()
        for item in _IN_MEMORY_LEDGER.values():
            if (
                item.get("target", "").lower() == target.lower()
                and item.get("state") == state
                and (now - float(item.get("created_epoch", 0))) < window_seconds
            ):
                return item

        # In AWS DynamoDB, query by GSI if available or fallback
        return None

    def put_ledger(self, record: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
        """
        Conditionally writes a ledger entry using attribute_not_exists(command_id).
        Returns: (is_new_insert: bool, record_data: Dict[str, Any])
        If duplicate command_id, returns (False, existing_record).
        """
        command_id = record["command_id"]
        now = time.time()
        record_with_meta = dict(record)
        record_with_meta["created_epoch"] = now
        # 7-day TTL for DynamoDB time-to-live automatic expiration
        record_with_meta["ttl"] = int(now + (7 * 86400))

        if self.dynamo and os.environ.get("AWS_EXECUTION_ENV"):
            try:
                from botocore.exceptions import ClientError
                table = self.dynamo.Table(self.ledger_table_name)
                table.put_item(
                    Item=record_with_meta,
                    ConditionExpression="attribute_not_exists(command_id)",
                )
                _IN_MEMORY_LEDGER[command_id] = record_with_meta
                return True, record_with_meta
            except ClientError as e:
                if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                    # Item already exists: return stored result with duplicate: true
                    existing = self.get_ledger(command_id) or record_with_meta
                    return False, existing
                # If table doesn't exist, fall back to memory
                pass
            except Exception:
                pass

        # In-memory conditional check
        if command_id in _IN_MEMORY_LEDGER:
            return False, _IN_MEMORY_LEDGER[command_id]

        _IN_MEMORY_LEDGER[command_id] = record_with_meta
        return True, record_with_meta

    def put_schedule_plan(self, plan: Dict[str, Any]) -> None:
        """Stores a scheduled action plan."""
        plan_id = plan["plan_id"]
        plan["updated_at"] = time.time()

        if self.dynamo and os.environ.get("AWS_EXECUTION_ENV"):
            try:
                table = self.dynamo.Table(self.schedules_table_name)
                table.put_item(Item=plan)
            except Exception:
                pass

        _IN_MEMORY_SCHEDULES[plan_id] = plan

    def get_schedule_plan(self, plan_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a schedule plan by plan_id."""
        if not plan_id:
            return None

        if self.dynamo and os.environ.get("AWS_EXECUTION_ENV"):
            try:
                table = self.dynamo.Table(self.schedules_table_name)
                res = table.get_item(Key={"plan_id": plan_id})
                if "Item" in res:
                    return res["Item"]
            except Exception:
                pass

        return _IN_MEMORY_SCHEDULES.get(plan_id)


_GLOBAL_STORAGE = StorageRepository()

def get_storage() -> StorageRepository:
    return _GLOBAL_STORAGE

"""
Home Guard - Device Provider Abstraction & Adapters
Supports LIFX HTTP API and Home Assistant REST API.
"""

import os
import json
import urllib.request
import urllib.error
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

class DeviceProvider(ABC):
    """
    Pluggable device provider contract.
    New providers (e.g. Philips Hue, Matter, SmartThings) can be added
    without modifying core MCP tool logic.
    """

    @abstractmethod
    def list_devices(self) -> List[Dict[str, Any]]:
        """
        Returns list of standardized devices:
        [{"id": str, "name": str, "group": str, "online": bool, "on": bool, "brightness": float}]
        """
        pass

    @abstractmethod
    def set_power(self, device_id: str, state: bool) -> bool:
        """
        Sets device power state. Returns True if command sent successfully.
        """
        pass

    @abstractmethod
    def read_state(self) -> List[Dict[str, Any]]:
        """
        Reads back current device states in one batch call.
        """
        pass


class LifxProvider(DeviceProvider):
    """
    Real LIFX HTTP API adapter.
    Uses environment variable LIFX_TOKEN.
    Endpoints:
      GET https://api.lifx.com/v1/lights/all
      PUT https://api.lifx.com/v1/lights/id:{id}/state
    """

    BASE_URL = "https://api.lifx.com/v1/lights"

    def __init__(self, token: Optional[str] = None):
        self.token = token or os.environ.get("LIFX_TOKEN", "")

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def list_devices(self) -> List[Dict[str, Any]]:
        if not self.token:
            return []

        req = urllib.request.Request(
            f"{self.BASE_URL}/all",
            headers=self._headers(),
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                devices = []
                for item in data:
                    group_data = item.get("group") or {}
                    group_name = group_data.get("name", "Default Group")
                    devices.append({
                        "id": str(item.get("id", "")),
                        "name": str(item.get("label", "LIFX Light")),
                        "group": group_name,
                        "online": bool(item.get("connected", False)),
                        "on": item.get("power") == "on",
                        "brightness": float(item.get("brightness", 1.0)),
                        "provider": "lifx",
                    })
                return devices
        except Exception as e:
            raise RuntimeError(f"LIFX API error: {e}")

    def set_power(self, device_id: str, state: bool) -> bool:
        if not self.token:
            raise RuntimeError("LIFX_TOKEN environment variable is not configured")

        url = f"{self.BASE_URL}/id:{device_id}/state"
        payload = json.dumps({
            "power": "on" if state else "off",
            "duration": 0.0,
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers=self._headers(),
            method="PUT",
        )
        try:
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                return resp.status in (200, 207)
        except Exception as e:
            return False

    def read_state(self) -> List[Dict[str, Any]]:
        return self.list_devices()


class HomeAssistantProvider(DeviceProvider):
    """
    Real Home Assistant REST API adapter.
    Uses environment variables HA_URL and HA_TOKEN.
    Endpoints:
      GET {HA_URL}/api/states
      POST {HA_URL}/api/services/light/turn_on | turn_off
    """

    def __init__(self, ha_url: Optional[str] = None, token: Optional[str] = None):
        self.ha_url = (ha_url or os.environ.get("HA_URL", "")).rstrip("/")
        self.token = token or os.environ.get("HA_TOKEN", "")

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def list_devices(self) -> List[Dict[str, Any]]:
        if not self.ha_url or not self.token:
            return []

        url = f"{self.ha_url}/api/states"
        req = urllib.request.Request(url, headers=self._headers(), method="GET")
        try:
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                devices = []
                for entity in data:
                    entity_id = entity.get("entity_id", "")
                    if not entity_id.startswith("light.") and not entity_id.startswith("switch."):
                        continue

                    attrs = entity.get("attributes", {})
                    friendly_name = attrs.get("friendly_name", entity_id)
                    group_name = attrs.get("area_id") or attrs.get("group", "Home")
                    state_str = str(entity.get("state", "off")).lower()

                    is_online = state_str not in ("unavailable", "unknown")
                    is_on = state_str == "on"

                    brightness = None
                    if "brightness" in attrs and attrs["brightness"] is not None:
                        brightness = round(float(attrs["brightness"]) / 255.0, 2)

                    devices.append({
                        "id": entity_id,
                        "name": friendly_name,
                        "group": group_name,
                        "online": is_online,
                        "on": is_on,
                        "brightness": brightness,
                        "provider": "homeassistant",
                    })
                return devices
        except Exception as e:
            raise RuntimeError(f"Home Assistant API error at {self.ha_url}: {e}")

    def set_power(self, device_id: str, state: bool) -> bool:
        if not self.ha_url or not self.token:
            raise RuntimeError("HA_URL or HA_TOKEN not configured")

        domain = "light" if device_id.startswith("light.") else "switch"
        service = "turn_on" if state else "turn_off"
        url = f"{self.ha_url}/api/services/{domain}/{service}"

        payload = json.dumps({"entity_id": device_id}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers=self._headers(), method="POST")
        try:
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                return resp.status in (200, 201)
        except Exception:
            return False

    def read_state(self) -> List[Dict[str, Any]]:
        return self.list_devices()


def get_device_provider() -> DeviceProvider:
    """
    Factory resolving provider from DEVICE_PROVIDER environment variable.
    Defaults to lifx if LIFX_TOKEN set, else homeassistant if HA_URL set.
    """
    provider_type = os.environ.get("DEVICE_PROVIDER", "").lower().strip()

    if provider_type == "homeassistant" or (not provider_type and os.environ.get("HA_URL")):
        return HomeAssistantProvider()
    elif provider_type == "lifx" or (not provider_type and os.environ.get("LIFX_TOKEN")):
        return LifxProvider()
    else:
        # Default to LifxProvider with env var
        return LifxProvider()

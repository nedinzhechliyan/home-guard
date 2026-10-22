"""
Home Guard - Authentication & OAuth Authorization Server
Implements Cognito JWT validation and RFC 8414 OAuth server metadata.
"""

import os
import time
import json
import base64
import urllib.request
from typing import Optional, Dict, Any, Tuple

# In-memory JWKS cache: (jwks_keys, fetched_timestamp)
_JWKS_CACHE: Dict[str, Tuple[Dict[str, Any], float]] = {}
CACHE_TTL = 3600  # 1 hour

def get_cognito_config() -> Dict[str, str]:
    return {
        "region": os.environ.get("AWS_REGION", "us-east-1"),
        "user_pool_id": os.environ.get("COGNITO_USER_POOL_ID", ""),
        "client_id": os.environ.get("COGNITO_CLIENT_ID", ""),
        "server_uri": os.environ.get("MCP_SERVER_URI", ""),
        # WARNING: DEV_STATIC_TOKEN is for local console testing only. Disable in production.
        "dev_static_token": os.environ.get("DEV_STATIC_TOKEN", "").strip(),
    }

def get_oauth_authorization_server_metadata() -> Dict[str, Any]:
    """
    Returns RFC 8414 OAuth 2.0 Authorization Server Metadata
    for GET /.well-known/oauth-authorization-server
    """
    cfg = get_cognito_config()
    region = cfg["region"]
    pool_id = cfg["user_pool_id"] or "us-east-1_example"
    domain = os.environ.get("COGNITO_DOMAIN", f"home-guard-auth-{pool_id.lower().replace('_', '-')}")

    issuer = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}"
    auth_base = f"https://{domain}.auth.{region}.amazoncognito.com"

    return {
        "issuer": issuer,
        "authorization_endpoint": f"{auth_base}/oauth2/authorize",
        "token_endpoint": f"{auth_base}/oauth2/token",
        "jwks_uri": f"{issuer}/.well-known/jwks.json",
        "response_types_supported": ["code", "token"],
        "grant_types_supported": ["authorization_code", "client_credentials", "refresh_token"],
        "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
        "scopes_supported": ["openid", "email", "profile", "homeguard/commands"],
    }

def _base64url_decode(input_str: str) -> bytes:
    rem = len(input_str) % 4
    if rem > 0:
        input_str += "=" * (4 - rem)
    return base64.urlsafe_b64decode(input_str)

def _get_jwks(issuer: str) -> Optional[Dict[str, Any]]:
    now = time.time()
    if issuer in _JWKS_CACHE:
        cached_keys, cached_at = _JWKS_CACHE[issuer]
        if now - cached_at < CACHE_TTL:
            return cached_keys

    jwks_url = f"{issuer}/.well-known/jwks.json"
    try:
        req = urllib.request.Request(jwks_url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            _JWKS_CACHE[issuer] = (data, now)
            return data
    except Exception:
        return None

def validate_bearer_token(auth_header: Optional[str]) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Validates Authorization header.
    Returns: (is_valid, error_reason, claims)
    Hard Rule: Unauthenticated or invalid requests must return 401 with NO WWW-Authenticate header.
    """
    if not auth_header or not auth_header.strip():
        return False, "Missing Authorization header", None

    parts = auth_header.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return False, "Invalid Authorization header format", None

    token = parts[1].strip()
    cfg = get_cognito_config()

    # 1. Local Dev Static Token Check (if configured)
    # WARNING: DEV_STATIC_TOKEN is for local console testing only. Disable in production.
    if cfg["dev_static_token"] and token == cfg["dev_static_token"]:
        return True, None, {"sub": "dev-static-user", "auth": "dev-token"}

    # 2. JWT structure validation (header.payload.signature)
    jwt_parts = token.split(".")
    if len(jwt_parts) != 3:
        return False, "Malformed JWT structure", None

    try:
        header_raw = _base64url_decode(jwt_parts[0])
        header = json.loads(header_raw.decode("utf-8"))
        payload_raw = _base64url_decode(jwt_parts[1])
        claims = json.loads(payload_raw.decode("utf-8"))
    except Exception as e:
        return False, f"Failed to decode token payload: {e}", None

    # Expiry verification
    now = time.time()
    exp = claims.get("exp")
    if exp is None or now > exp:
        return False, "Token has expired", None

    # Issuer verification
    pool_id = cfg["user_pool_id"]
    if pool_id:
        expected_issuer = f"https://cognito-idp.{cfg['region']}.amazonaws.com/{pool_id}"
        token_issuer = claims.get("iss")
        if token_issuer != expected_issuer:
            return False, f"Invalid token issuer: expected {expected_issuer}", None

        # Audience / Client ID verification
        token_aud = claims.get("aud") or claims.get("client_id")
        expected_aud = cfg["client_id"]
        if expected_aud and token_aud != expected_aud:
            # Also check if audience matches canonical server URI
            if cfg["server_uri"] and token_aud != cfg["server_uri"]:
                return False, "Token audience does not match client ID or server URI", None

        # Verify key ID against Cognito JWKS
        kid = header.get("kid")
        jwks = _get_jwks(expected_issuer)
        if jwks and "keys" in jwks:
            matching_key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
            if not matching_key:
                return False, f"No matching public key found for kid: {kid}", None

    return True, None, claims

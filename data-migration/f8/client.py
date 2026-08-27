"""F8 API client with token management, retry, and 401 refresh."""
import json as _json
import logging
import time
import threading
from datetime import datetime, timezone
from typing import Any

import httpx

_logger = logging.getLogger(__name__)

from config import settings


class TokenManager:
    """Manages F8 API authentication token with automatic refresh."""

    def __init__(self, auth_url: str, client_id: str, sign: str) -> None:
        self._auth_url = auth_url
        self._client_id = client_id
        self._sign = sign
        self._token: str | None = None
        self._expires_at: float = 0.0
        self._lock = threading.Lock()

    def get_token(self) -> str:
        """Get a valid token, refreshing if necessary."""
        with self._lock:
            if self._token and time.time() < self._expires_at - 30:
                return self._token
            self._refresh()
            # _refresh() always sets self._token, so it's safe to assert
            assert self._token is not None, "Token refresh failed to set token"
            return self._token

    def _refresh(self) -> None:
        """Fetch a new token from the auth endpoint."""
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                self._auth_url,
                json={
                    "clientId": self._client_id,
                    "timestamp": int(time.time()),
                    "sign": self._sign,
                },
            )
            resp.raise_for_status()
            data = resp.json()
        self._token = data["accessToken"]
        exp_str: str = data["accessTokenExpirationTime"]
        exp_dt = datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
        self._expires_at = exp_dt.timestamp()

    def force_expire(self) -> None:
        """Force token to expire on next use (for 401/403 handling)."""
        with self._lock:
            self._expires_at = 0


_token_manager = TokenManager(
    auth_url=settings.f8_auth_url,
    client_id=settings.f8_client_id,
    sign=settings.f8_sign,
)


def _request_with_retry(
    method: str,
    url: str,
    timeout: float = 30.0,
    retries: int = 3,
    retry_delay: float = 2.0,
    **kwargs: Any,
) -> Any:
    """Make HTTP request with retry logic and automatic token refresh on 401/403."""
    last_exc: Exception = RuntimeError("No retry attempts made")
    for attempt in range(retries + 1):
        token = _token_manager.get_token()
        headers = kwargs.pop("headers", {})
        headers["AuthorizationToken"] = token
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = getattr(client, method)(url, headers=headers, **kwargs)
                if resp.status_code in (401, 403):
                    _token_manager.force_expire()
                    raise httpx.HTTPStatusError(
                        f"Auth error {resp.status_code}", request=resp.request, response=resp
                    )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as e:
            last_exc = e
            if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 504:
                raise  # don't retry 504 — fetch_with_chunk_retry handles splitting
            if attempt < retries:
                time.sleep(retry_delay)
    raise last_exc


class F8Client:
    """Client for F8 API endpoints."""

    def get_crew(self) -> list[dict]:
        """Get all crew members."""
        resp = _request_with_retry(
            "post",
            f"{settings.f8_base_url}/crew",
            json={},
            timeout=120.0,
        )
        if isinstance(resp, dict) and "body" in resp:
            body = resp["body"]
            if isinstance(body, str):
                body = _json.loads(body)
            if not isinstance(body, list):
                _logger.warning("crew: upstream error %s", body)
                return []
            return body
        if not isinstance(resp, list):
            _logger.warning("crew: unexpected response type %s", type(resp).__name__)
            return []
        return resp

    def get_flight(self, start_dt: str, end_dt: str) -> list[dict]:
        """Get flights in date range."""
        resp = _request_with_retry(
            "post",
            f"{settings.f8_base_url}/flight",
            json={"startDt": start_dt, "endDt": end_dt},
        )
        if isinstance(resp, dict) and "body" in resp:
            body = resp["body"]
            # API Gateway may double-encode the body as a JSON string
            if isinstance(body, str):
                body = _json.loads(body)
            if not isinstance(body, list):
                _logger.warning("flight %s~%s: upstream error %s", start_dt, end_dt, body)
                return []
            return body
        if not isinstance(resp, list):
            _logger.warning("flight %s~%s: unexpected response type %s", start_dt, end_dt, type(resp).__name__)
            return []
        return resp

    def get_pairing(self, start_dt: str, end_dt: str) -> list[dict]:
        """Get pairings in date range."""
        resp = _request_with_retry(
            "post",
            f"{settings.f8_base_url}/pairing",
            json={"startDt": start_dt, "endDt": end_dt},
        )
        if isinstance(resp, dict) and "body" in resp:
            body = resp["body"]
            if isinstance(body, str):
                body = _json.loads(body)
            if not isinstance(body, list):
                _logger.warning("pairing %s~%s: upstream error %s", start_dt, end_dt, body)
                return []
            return body
        if not isinstance(resp, list):
            _logger.warning("pairing %s~%s: unexpected response type %s", start_dt, end_dt, type(resp).__name__)
            return []
        return resp

    def get_manday(self, start_utc: str, end_utc: str) -> list[dict]:
        """Get crew manday stats for a UTC datetime range (all crews)."""
        resp = _request_with_retry(
            "post",
            f"{settings.f8_base_url}/manday",
            json={"startUtc": start_utc, "endUtc": end_utc, "owner": "F8", "crewIds": []},
            timeout=60.0,
        )
        if isinstance(resp, dict) and "body" in resp:
            body = resp["body"]
            if isinstance(body, str):
                body = _json.loads(body)
            if not isinstance(body, list):
                _logger.warning("manday %s~%s: upstream error %s", start_utc, end_utc, body)
                return []
            return body
        if not isinstance(resp, list):
            _logger.warning("manday %s~%s: unexpected response type %s", start_utc, end_utc, type(resp).__name__)
            return []
        return resp

    def get_roster_ground(self, start_dt: str, end_dt: str, assignment: str) -> list[dict]:
        """Get ground roster activities for one assignment type in a date range."""
        resp = _request_with_retry(
            "post",
            f"{settings.f8_base_url}/rosterGround",
            json={"startDt": start_dt, "endDt": end_dt, "assignment": assignment},
        )
        if isinstance(resp, dict) and "body" in resp:
            body = resp["body"]
            if isinstance(body, str):
                body = _json.loads(body)
            if not isinstance(body, list):
                _logger.warning("roster_ground %s %s~%s: upstream error %s", assignment, start_dt, end_dt, body)
                return []
            return body
        if not isinstance(resp, list):
            _logger.warning("roster_ground %s %s~%s: unexpected response type %s", assignment, start_dt, end_dt, type(resp).__name__)
            return []
        return resp

    def get_roster_flight(self, start_dt: str, end_dt: str) -> list[dict]:
        """Get roster flights in date range (API uses startUtc/endUtc/owner)."""
        resp = _request_with_retry(
            "post",
            f"{settings.f8_base_url}/rosterFlight",
            json={
                "startUtc": f"{start_dt} 00:00:00",
                "endUtc": f"{end_dt} 23:59:59",
                "owner": "F8",
            },
        )
        if isinstance(resp, dict) and "body" in resp:
            body = resp["body"]
            if isinstance(body, str):
                body = _json.loads(body)
            if not isinstance(body, list):
                _logger.warning("roster_flight %s~%s: upstream error %s", start_dt, end_dt, body)
                return []
            return body
        if not isinstance(resp, list):
            _logger.warning("roster_flight %s~%s: unexpected response type %s", start_dt, end_dt, type(resp).__name__)
            return []
        return resp


f8_client = F8Client()
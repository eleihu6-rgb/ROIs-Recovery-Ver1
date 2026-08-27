"""
Bid package client — login to live-server and download solver preference packages.

Interfaces:
  POST /api/auth/login                                  {userCode, password} -> data.token
  GET  /api/admin/algorithm-export/yeg-test-package     ?periodCode=... (admin Bearer) -> tgz
  POST /api/admin/algorithm-export/scenario-package     {periodCode, crewIds} (admin Bearer) -> tgz
"""
import logging
from typing import Mapping, Sequence
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)


def login(base_url: str, user_code: str, password: str, timeout: int = 30) -> str:
    """Login to live-server and return JWT token."""
    url = f"{base_url.rstrip('/')}/api/auth/login"
    try:
        resp = requests.post(url, json={"userCode": user_code, "password": password}, timeout=timeout)
    except requests.RequestException as exc:
        raise RuntimeError(f"bid package server login request failed: {exc}") from exc

    if resp.status_code != 200:
        raise RuntimeError(f"bid package server login failed (HTTP {resp.status_code}): {resp.text[:200]}")

    try:
        token = (resp.json().get("data") or {}).get("token")
    except ValueError as exc:
        raise RuntimeError("bid package server login returned non-JSON response") from exc
    if not token:
        raise RuntimeError("bid package server login response missing data.token")

    logger.info("bid package server login success, user=%s", user_code)
    return str(token)


def fetch_yeg_test_package(base_url: str, token: str, period_code: str,
                           roster_period_id: int, timeout: int = 120) -> bytes:
    """Download the YEG test preference package as tgz bytes."""
    url = (
        f"{base_url.rstrip('/')}/api/admin/algorithm-export/yeg-test-package"
        f"?periodCode={quote(period_code)}&rosterPeriodId={roster_period_id}"
    )
    try:
        resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=timeout)
    except requests.RequestException as exc:
        raise RuntimeError(f"fetch preference package failed: {exc}") from exc

    if not resp.ok:
        raise RuntimeError(f"fetch preference package HTTP {resp.status_code}: {resp.text[:200]}")
    if not resp.content:
        raise RuntimeError("fetch preference package returned empty response")

    logger.info("Fetched preference package, size=%d bytes", len(resp.content))
    return resp.content


def fetch_scenario_package(base_url: str, token: str, period_code: str,
                           crew_ids: Sequence[str], roster_period_id: int,
                           scenario_start: str | None = None,
                           scenario_end: str | None = None,
                           filters: Mapping[str, object] | None = None,
                           timeout: int = 600) -> bytes:
    """Download a scenario-scoped preference package as tgz bytes."""
    url = f"{base_url.rstrip('/')}/api/admin/algorithm-export/scenario-package"
    body: dict[str, object] = {
        "periodCode": period_code,
        "crewIds": list(crew_ids),
        "rosterPeriodId": roster_period_id,
    }
    if scenario_start and scenario_end:
        body["scenarioStart"] = scenario_start
        body["scenarioEnd"] = scenario_end
    if filters:
        body["filters"] = dict(filters)
    try:
        resp = requests.post(
            url,
            json=body,
            headers={"Authorization": f"Bearer {token}"},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"fetch scenario preference package failed: {exc}") from exc

    if not resp.ok:
        raise RuntimeError(
            f"fetch scenario preference package HTTP {resp.status_code}: {resp.text[:200]}"
        )
    if not resp.content:
        raise RuntimeError("fetch scenario preference package returned empty response")

    logger.info("Fetched scenario preference package, crew=%d size=%d bytes",
                len(crew_ids), len(resp.content))
    return resp.content

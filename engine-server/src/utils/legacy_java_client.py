"""
Legacy Java server client — handles login + API calls to the old Java admin server.

This is a temporary bridge until all functionality is migrated to the new system.
Supports the Pi Solution crew management server at http://localhost:8011.
"""
import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)


_ROIS_ENCRYPTED_PWD = (
    "d4JTPfQPpEfWGMX2BbS65OPFcGpZwZCUX2MhlEODC6D9WpbIyrgYNNO682m4qdSL"
    "2jKWjZT+WRR5D+qi7lGQjuP/dfcf4jsqgXKbrniksdAGCN/Hnbdj4/AJR/V/Nx+P"
    "BYb87fAlenOexE3s/7yHu8a5SoVIiC4zAkzJQoKBIIQ="
)

# Permanent service-account token embedded in the Java server (OUTUSE, exp ~2040).
# Login tokens returned by /login are session tokens that don't work for API calls;
# this hardcoded token is the correct auth for /api/orengine/* endpoints.
_API_TOKEN = (
    "eyJhbGciOiJIUzI1NiJ9"
    ".eyIwIjoxLCJpc3MiOiJhZG1pbkBwaS1zb2x1dGlvbiIsImV4cCI6MjIxMzk0NTY2"
    "NSwidXNlck5hbWUiOiJPVVRVU0UifQ"
    ".oSGghKKA1B9nwi25B3F8RDIBTm5uI46TwNX-Nv7T--U"
)


def login(base_url: str, username: str, password: str, timeout: int = 30) -> str:
    """Login to the Java admin server and return the JWT token.

    The Pi Solution server requires the password to be RSA-encrypted.
    For the ROIS account the encrypted value is pre-computed and fixed.

    Request format:
      POST /login
      Content-Type: application/json
      Body: {"user": {"userCode": "ROIS", "passwords": "<RSA_encrypted>", "outCaptcha": ""}}

    On success the response body is the raw JWT string (plain text).
    On failure the response body is a plain-text error like "USER_NOT_EXIST".

    Raises:
        RuntimeError: if login fails or the server returns an error.
    """
    url = f"{base_url.rstrip('/')}/login"
    # Use pre-computed RSA-encrypted password for the ROIS service account
    encrypted_pwd = _ROIS_ENCRYPTED_PWD
    payload = {"user": {"userCode": username, "passwords": encrypted_pwd, "outCaptcha": ""}}
    try:
        resp = requests.post(url, json=payload, timeout=timeout)
    except requests.RequestException as exc:
        raise RuntimeError(f"Java server login request failed: {exc}") from exc

    body = resp.text.strip()
    if resp.status_code != 200 or not body or body in (
        "USER_NOT_EXIST", "PASSWORD_ERROR", "LOGIN_FAIL", "ACCOUNT_LOCKED"
    ):
        raise RuntimeError(f"Java server login failed (HTTP {resp.status_code}): {body}")

    # If server returns JSON instead of raw token
    if body.startswith("{"):
        import json
        try:
            data = json.loads(body)
            token = data.get("data") or data.get("token") or data.get("jwt")
            if token:
                return str(token)
        except json.JSONDecodeError:
            pass

    logger.info("Java server login success, token length=%d", len(body))
    return body


def fetch_ro_input(base_url: str, token: str, scenario_id: int,
                   timeout: int = 120) -> bytes:
    """Call /api/orengine/ro/comptxt to get the old-format ro_input.gz bytes.

    Args:
        base_url: Java server base URL, e.g. "http://localhost:8011"
        token: ignored — the permanent service-account token (_API_TOKEN) is used
        scenario_id: RO scenario/workset ID
        timeout: request timeout in seconds

    Returns:
        Raw gzip bytes of the old-format ro_input.gz

    Raises:
        RuntimeError: on HTTP error or empty response
    """
    url = f"{base_url.rstrip('/')}/api/orengine/ro/comptxt"
    headers = {
        "Authorization": f"Bearer {_API_TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "Apache-HttpClient/4.5.2 (Java/1.8.0_111)",
    }
    try:
        resp = requests.post(url, json=scenario_id, headers=headers, timeout=timeout)
    except requests.RequestException as exc:
        raise RuntimeError(f"fetch ro input failed: {exc}") from exc

    if not resp.ok:
        raise RuntimeError(
            f"fetch ro input HTTP {resp.status_code}: {resp.text[:200]}"
        )
    if not resp.content:
        raise RuntimeError("fetch ro input returned empty response")

    logger.info("Fetched ro_input.gz from Java server, size=%d bytes", len(resp.content))
    return resp.content


def submit_ro_solution(base_url: str, token: str, process_id: int,
                       output_gz_bytes: bytes, timeout: int = 60) -> bool:
    """Submit old-format ro_output.gz to /api/orengine/ro/solution.

    Args:
        base_url: Java server base URL
        token: JWT obtained via login()
        process_id: the OR process/job ID (returned inside the input gz Scenario row)
        output_gz_bytes: raw gzip bytes of old-format ro_output.gz
        timeout: request timeout in seconds

    Returns:
        True on success

    Raises:
        RuntimeError: on HTTP error
    """
    url = f"{base_url.rstrip('/')}/api/orengine/ro/solution"
    headers = {
        "Authorization": f"Bearer {_API_TOKEN}",
        "Content-Type": "application/octet-stream",
        "User-Agent": "Apache-HttpClient/4.5.2 (Java/1.8.0_111)",
        # Java server may need the process/scenario ID as a header or query param
        "processId": str(process_id),
    }
    try:
        resp = requests.post(
            url,
            data=output_gz_bytes,
            headers=headers,
            params={"id": process_id},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise RuntimeError(f"submit ro solution failed: {exc}") from exc

    if not resp.ok:
        raise RuntimeError(
            f"submit ro solution HTTP {resp.status_code}: {resp.text[:200]}"
        )

    logger.info("Submitted ro_output.gz to Java server, process_id=%s, size=%d bytes",
                process_id, len(output_gz_bytes))
    return True


def extract_process_id_from_input(input_gz_bytes: bytes) -> Optional[int]:
    """Extract processId from the Scenario section of old-format ro_input.gz.

    Old format section header: ------Scenario(1):worksetId,version,status,processId,...
    Data row uses '^' as delimiter.

    Returns the processId as int, or None if not found / empty.
    """
    import gzip
    import io

    try:
        with gzip.GzipFile(fileobj=io.BytesIO(input_gz_bytes), mode="rb") as gz:
            text = gz.read().decode("utf-8", errors="replace")
    except Exception:
        return None

    in_scenario = False
    headers: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("------Scenario("):
            # Extract headers after the colon
            colon_idx = stripped.find(":")
            if colon_idx >= 0:
                headers = stripped[colon_idx + 1:].split(",")
            in_scenario = True
            continue
        if in_scenario and stripped:
            # First data row
            values = stripped.split("^")
            row = dict(zip(headers, values))
            pid_str = row.get("processId", "").strip()
            if pid_str and pid_str.isdigit():
                return int(pid_str)
            # processId empty — fall back to worksetId as the identifier
            workset_str = row.get("worksetId", "").strip()
            if workset_str and workset_str.isdigit():
                logger.debug(
                    "processId empty in Scenario, using worksetId=%s as fallback", workset_str
                )
                return int(workset_str)
            return None
        elif in_scenario:
            # Empty line after section, stop
            break
    return None

"""Map PyO3 violation pipe strings to Live/Scenario Alert Center English bodies.

Display-only for ``ro_check`` Warning Message / console. Unmapped codes return
``None`` so callers fall back to ``_fmt_viol_detail``.

Templates: ``packages/legality-messages/messages.json`` (shared with Live Gantt).
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

_MESSAGES_PATH = (
    Path(__file__).resolve().parents[2]
    / "packages"
    / "legality-messages"
    / "messages.json"
)
_MESSAGES: dict = json.loads(_MESSAGES_PATH.read_text())

_PLACEHOLDER_RE = re.compile(r"\{([a-z][a-z0-9_]*)\}")


def parse_pipe(v: str) -> tuple[str, dict[str, str]]:
    """Split ``CODE|k=v|…`` into ``(code, {k: v, …})``. Missing ``=`` parts are skipped."""
    parts = v.split("|")
    code = parts[0] if parts else ""
    fields: dict[str, str] = {}
    for part in parts[1:]:
        if "=" not in part:
            continue
        key, val = part.split("=", 1)
        fields[key] = val
    return code, fields


def _fill_template(template: str, fields: dict[str, str | None]) -> str | None:
    """Mirror ``@rois/legality-messages`` ``fillTemplate``: null/empty → ``None``."""
    names = _PLACEHOLDER_RE.findall(template)
    for name in names:
        val = fields.get(name)
        if val is None or val == "":
            return None
    return _PLACEHOLDER_RE.sub(lambda m: str(fields[m.group(1)]), template)


def _render_rule_body(rule_code: str, fields: dict[str, str | None]) -> str | None:
    body = _MESSAGES.get("rules", {}).get(rule_code, {}).get("body")
    if not body:
        return None
    return _fill_template(body, fields)


def _msg_8072(fields: dict[str, str]) -> str | None:
    return _render_rule_body("8072", fields)


def _msg_7506(fields: dict[str, str]) -> str | None:
    # Phase 1: format Engine local_day_start_utc as a UTC calendar date → {day}.
    raw = fields.get("local_day_start")
    if raw is None:
        return None
    try:
        ts = int(raw)
        day = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
    except (ValueError, OSError, OverflowError):
        return None
    return _render_rule_body("7506", {"day": day})


def _msg_7509(fields: dict[str, str]) -> str | None:
    return _render_rule_body(
        "7509",
        {
            "crew_id": fields.get("crew"),
            "paired_crew_id": fields.get("paired_crew"),
            "flight_label": fields.get("flight"),
        },
    )


_HANDLERS: dict[str, Callable[[dict[str, str]], str | None]] = {
    "8072": _msg_8072,
    "7506": _msg_7506,
    "7509": _msg_7509,
}


def format_live_style_message(v: str) -> str | None:
    """Return Live-style English body for a known pipe string, else ``None``."""
    if not v:
        return None
    code, fields = parse_pipe(v)
    handler = _HANDLERS.get(code)
    if handler is None:
        return None
    return handler(fields)


def dedupe_violations_for_display(violations: list[str]) -> list[str]:
    """Keep the first pipe per Warning Message body (e.g. multi-segment 8072).

    Mapped rules key on ``format_live_style_message``; unmapped keep distinct raw pipes.
    """
    seen: set[str] = set()
    out: list[str] = []
    for v in violations:
        key = format_live_style_message(v) or v
        if key in seen:
            continue
        seen.add(key)
        out.append(v)
    return out

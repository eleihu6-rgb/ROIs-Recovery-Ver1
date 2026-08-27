"""Formatting + emission of legacy ro_input.txt sections."""
from __future__ import annotations

from datetime import datetime, date
from decimal import Decimal


def format_value(v, fmt: str | None = None) -> str:
    if v is None:
        return ""
    if fmt == "bool01":
        return "true" if int(v) == 1 else "false"
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%dT%H:%M:%S")
    if isinstance(v, date):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, Decimal):
        return format(v, "f")
    return str(v)


def emit_section(name: str, variant: str | None, columns: list[str],
                 rows: list[list]) -> str:
    """Return the full section text: header line + one line per row.

    `rows` values are aligned to `columns` order; each value may be a raw DB
    value (formatted via format_value) — bool01 formatting is applied by the
    caller before passing rows in (rows are already strings or raw values).
    """
    var = f"({variant})" if variant else ""
    header = f"------{name}({len(rows)}){var}:{','.join(columns)}"
    out = [header]
    for row in rows:
        out.append("^".join(format_value(v) for v in row))
    return "\n".join(out) + "\n"

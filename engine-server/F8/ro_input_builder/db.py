"""DB connection helpers for the ro_input builder.

DSN resolution order: explicit arg > LEGACY_RO_DB_URL env.
"""
from __future__ import annotations

import os


def resolve_dsn(airline: str, explicit: str | None = None) -> str:
    if explicit:
        return explicit
    env = os.environ.get("LEGACY_RO_DB_URL")
    if env:
        return env
    raise RuntimeError(f"LEGACY_RO_DB_URL is required for airline {airline}")


def connect(airline: str, explicit: str | None = None):
    import psycopg2
    return psycopg2.connect(resolve_dsn(airline, explicit))

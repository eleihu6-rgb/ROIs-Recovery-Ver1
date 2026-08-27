import re
from pathlib import Path

import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden, cli

GOLDEN = "complete/F8/6_20260612_125629/ro_input.txt"


@pytest.fixture(autouse=True)
def _pg_rule_source(monkeypatch):
    monkeypatch.delenv("RO_RULE_SOURCE", raising=False)


def _golden_order():
    if not Path(GOLDEN).exists():
        pytest.skip(f"golden ro_input fixture missing: {GOLDEN}")
    keys = []
    for line in open(GOLDEN, encoding="utf-8").read().splitlines():
        m = re.match(r"------(\w+)\(\d+\)(?:\((\w+)\))?:", line)
        if m:
            keys.append(f"{m.group(1)}({m.group(2)})" if m.group(2) else m.group(1))
    return keys


@pytest.fixture(scope="module")
def conn():
    try:
        c = db.connect("f8")
    except (psycopg2.OperationalError, RuntimeError) as e:
        pytest.skip(f"f8 DB unavailable: {e}")
    yield c
    c.close()


def test_full_registry_section_order_matches_golden(conn, tmp_path):
    cur = conn.cursor()
    cur.execute("SELECT EXISTS (SELECT 1 FROM scenario WHERE id = %s)", (6,))
    exists = bool(cur.fetchone()[0])
    cur.close()
    if not exists:
        pytest.skip("golden scenario 6 is not present in this database")
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="full")
    text = out.read_text()
    got = []
    for line in text.splitlines():
        m = re.match(r"------(\w+)\(\d+\)(?:\((\w+)\))?:", line)
        if m:
            got.append(f"{m.group(1)}({m.group(2)})" if m.group(2) else m.group(1))
    assert got == _golden_order()       # exact 61-section order, including variants

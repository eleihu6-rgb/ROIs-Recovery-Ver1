# RO Input DB Generation — P0 (Framework) + P1 (Reference Sections) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a declarative, registry-driven builder in `engine-server/F8/ro_input_builder/` that generates a legacy `ro_input.txt` from PostgreSQL, and implement the ~22 P1 "reference" sections (direct-map tables + static passthrough for the 6 sourceless sections), validated against the scenario-6 golden file.

**Architecture:** A generic emitter formats `------Name(count)[(variant)]:cols` headers + `^`-delimited rows from an ordered registry of `SectionSpec`s. Simple sections declare `table` + ordered `Col(legacy, db, fmt)` mappings and the emitter auto-builds the `SELECT`. Complex/sourceless sections supply a `custom` callable. A golden-comparison harness parses the reference `ro_input.txt` into sections for per-section assertions.

**Tech Stack:** Python 3.12, psycopg2, pytest. Reuses the DB-URL/env convention from `engine-server/F8/legacy_ro_converter.py` (`LEGACY_RO_DB_URL`).

**Spec:** `docs/superpowers/specs/2026-06-15-ro-input-db-generation-design.md`

**Golden reference:** `engine-server/complete/F8/6_20260612_125629/ro_input.txt`

**Run all commands from `engine-server/`. Use the ro-engine venv python:** `/home/yuan.z/rois/rois-ai/ro-engine/.venv/bin/python` (has psycopg2 + pytest). Shorthand below: `PY=/home/yuan.z/rois/rois-ai/ro-engine/.venv/bin/python`.

---

## File Structure

```
engine-server/F8/ro_input_builder/
  __init__.py
  db.py            # connection from airline code / env DSN
  emitter.py       # value formatting + section emission
  registry.py      # SectionSpec/Col dataclasses + REGISTRY (ordered list)
  golden.py        # parse a golden ro_input.txt into sections (test/harness use)
  sections/
    __init__.py
    reference.py    # P1 direct-map SectionSpecs
    passthrough.py  # static passthrough for sourceless sections
  reference_snapshot/
    ro_input.reference.txt   # committed copy of golden, source for passthrough sections
  cli.py           # `python -m F8.ro_input_builder ...`
engine-server/tests/
  test_ro_input_emitter.py
  test_ro_input_reference_sections.py   # P1 DB-backed section tests
```

> The builder lives under `engine-server/F8/` next to `legacy_ro_converter.py`. Commands assume CWD `engine-server/` so `F8.ro_input_builder` is importable.

---

## Conventions used by every section (from mapping research)

- `id` → `id`, `lastModified` → `updated_at`, `modifiedBy` → `updated_by` on every table.
- Boolean-ish smallint columns (`is_*`, `is_prime_display_base`) render as lowercase `true`/`false` in the golden → use `fmt='bool01'`.
- `None` → empty string; `datetime` → `%Y-%m-%dT%H:%M:%S`; `date` → `%Y-%m-%d`; `Decimal`/`float`/`int` → `str()`.
- A `Col` with `db=None` emits a constant empty string (sourceless legacy column).

---

## Task 0.1: Package scaffold + DB connection

**Files:**
- Create: `engine-server/F8/ro_input_builder/__init__.py`
- Create: `engine-server/F8/ro_input_builder/db.py`
- Create: `engine-server/F8/ro_input_builder/sections/__init__.py`
- Test: `engine-server/tests/test_ro_input_emitter.py`

- [ ] **Step 1: Create empty package files**

```bash
mkdir -p F8/ro_input_builder/sections F8/ro_input_builder/reference_snapshot
: > F8/ro_input_builder/__init__.py
: > F8/ro_input_builder/sections/__init__.py
```

- [ ] **Step 2: Write the failing test for db DSN resolution**

Create `engine-server/tests/test_ro_input_emitter.py`:

```python
import os
import pytest
from F8.ro_input_builder import db


def test_resolve_dsn_prefers_explicit_arg():
    dsn = db.resolve_dsn("f8", explicit="postgresql://x/y")
    assert dsn == "postgresql://x/y"


def test_resolve_dsn_uses_env(monkeypatch):
    monkeypatch.setenv("LEGACY_RO_DB_URL", "postgresql://env/db")
    assert db.resolve_dsn("f8") == "postgresql://env/db"


def test_resolve_dsn_default_sets_search_path(monkeypatch):
    monkeypatch.delenv("LEGACY_RO_DB_URL", raising=False)
    dsn = db.resolve_dsn("f8")
    assert "search_path%3Df8" in dsn or "search_path=f8" in dsn
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /home/yuan.z/rois/rois-ai/engine-server && $PY -m pytest tests/test_ro_input_emitter.py -v`
Expected: FAIL with `ModuleNotFoundError` / `AttributeError: module 'db' has no attribute 'resolve_dsn'`.

- [ ] **Step 4: Implement `db.py`**

```python
"""DB connection helpers for the ro_input builder.

DSN resolution order: explicit arg > LEGACY_RO_DB_URL env > per-airline default
(localhost rois DB, search_path = airline code). Mirrors legacy_ro_converter.py.
"""
from __future__ import annotations

import os
from urllib.parse import quote

# Per-airline credentials are NOT hardcoded here for non-f8; default covers local f8 dev only.
_DEFAULT_USER = {"f8": "f8", "tg": "tg"}


def resolve_dsn(airline: str, explicit: str | None = None) -> str:
    if explicit:
        return explicit
    env = os.environ.get("LEGACY_RO_DB_URL")
    if env:
        return env
    code = airline.lower()
    user = _DEFAULT_USER.get(code, code)
    pwd = os.environ.get(f"ROIS_DB_PWD_{code.upper()}", "")
    sp = quote(f"-c search_path={code}")
    return f"postgresql://{user}:{pwd}@localhost:5432/rois?options={sp}"


def connect(airline: str, explicit: str | None = None):
    import psycopg2
    return psycopg2.connect(resolve_dsn(airline, explicit))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `$PY -m pytest tests/test_ro_input_emitter.py -v`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add F8/ro_input_builder/__init__.py F8/ro_input_builder/db.py F8/ro_input_builder/sections/__init__.py tests/test_ro_input_emitter.py
git commit -m "feat(engine-server): ro_input_builder package scaffold + DB DSN resolver

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 0.2: Value formatting + section emitter

**Files:**
- Create: `engine-server/F8/ro_input_builder/emitter.py`
- Test: `engine-server/tests/test_ro_input_emitter.py` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `engine-server/tests/test_ro_input_emitter.py`:

```python
from datetime import datetime, date
from decimal import Decimal
from F8.ro_input_builder import emitter


def test_format_value_handles_types():
    assert emitter.format_value(None) == ""
    assert emitter.format_value(datetime(2026, 6, 29, 16, 35, 0)) == "2026-06-29T16:35:00"
    assert emitter.format_value(date(2026, 6, 29)) == "2026-06-29"
    assert emitter.format_value(Decimal("4.50")) == "4.50"
    assert emitter.format_value(0) == "0"
    assert emitter.format_value("YEG") == "YEG"


def test_format_value_bool01():
    assert emitter.format_value(1, fmt="bool01") == "true"
    assert emitter.format_value(0, fmt="bool01") == "false"
    assert emitter.format_value(None, fmt="bool01") == ""


def test_emit_section_header_and_rows():
    out = emitter.emit_section("Fleet", None, ["id", "fleet"], [[1, "737"], [2, "320"]])
    lines = out.splitlines()
    assert lines[0] == "------Fleet(2):id,fleet"
    assert lines[1] == "1^737"
    assert lines[2] == "2^320"


def test_emit_section_with_variant():
    out = emitter.emit_section("Crew", "COF", ["crewId"], [[5]])
    assert out.splitlines()[0] == "------Crew(1)(COF):crewId"


def test_emit_section_empty():
    out = emitter.emit_section("City", None, ["id", "city"], [])
    assert out.rstrip("\n") == "------City(0):id,city"
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_emitter.py -k "format_value or emit_section" -v`
Expected: FAIL (`module 'emitter' not found`).

- [ ] **Step 3: Implement `emitter.py`**

```python
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
```

> Note: `emit_section` calls `format_value` with no `fmt`. Per-column `bool01` formatting is applied earlier (in the registry runner, Task 0.3) so values reaching `emit_section` are already final-typed. The `bool01` test above exercises `format_value` directly.

- [ ] **Step 4: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_emitter.py -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/emitter.py tests/test_ro_input_emitter.py
git commit -m "feat(engine-server): ro_input emitter (value formatting + section header/rows)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 0.3: Registry dataclasses + SQL section runner

**Files:**
- Create: `engine-server/F8/ro_input_builder/registry.py`
- Test: `engine-server/tests/test_ro_input_emitter.py` (extend)

- [ ] **Step 1: Write the failing test (runner builds SELECT + formats rows)**

Append to `engine-server/tests/test_ro_input_emitter.py`:

```python
from F8.ro_input_builder import registry


def test_col_select_expr_maps_and_nulls():
    cols = [registry.Col("id", "id"), registry.Col("acType", "ac_type"),
            registry.Col("ccRestFacility", None)]
    assert registry.select_list(cols) == "id, ac_type, NULL"


def test_build_query_simple():
    spec = registry.SectionSpec(
        name="Fleet", table="fleet",
        cols=[registry.Col("id", "id"), registry.Col("fleet", "fleet")],
        order_by="id",
    )
    assert registry.build_query(spec) == "SELECT id, fleet FROM fleet ORDER BY id"


def test_build_query_with_where():
    spec = registry.SectionSpec(
        name="SystemParameter", table="dictionary",
        cols=[registry.Col("id", "id")],
        where="parent_code = 'SYS_PARAM'", order_by="id",
    )
    assert registry.build_query(spec) == (
        "SELECT id FROM dictionary WHERE parent_code = 'SYS_PARAM' ORDER BY id"
    )


def test_apply_formats_bool01():
    cols = [registry.Col("id", "id"), registry.Col("isActingRank", "is_acting_rank", fmt="bool01")]
    raw_rows = [(7, 1), (8, 0)]
    assert registry.apply_formats(cols, raw_rows) == [[7, "true"], [8, "false"]]
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_emitter.py -k "Col or build_query or apply_formats" -v`
Expected: FAIL (`module 'registry' not found`).

- [ ] **Step 3: Implement `registry.py`**

```python
"""SectionSpec registry + SQL builder for the ro_input builder."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from . import emitter


@dataclass
class Col:
    legacy: str                 # output header name (camelCase legacy)
    db: Optional[str] = None    # source snake_case column; None => emit empty
    fmt: Optional[str] = None   # 'bool01' or None


@dataclass
class SectionSpec:
    name: str
    cols: list[Col]
    table: Optional[str] = None
    where: str = ""
    order_by: str = ""
    variant: Optional[str] = None
    custom: Optional[Callable] = None   # custom(conn, ctx) -> list[list]; overrides table


def select_list(cols: list[Col]) -> str:
    return ", ".join(c.db if c.db else "NULL" for c in cols)


def build_query(spec: SectionSpec) -> str:
    q = f"SELECT {select_list(spec.cols)} FROM {spec.table}"
    if spec.where:
        q += f" WHERE {spec.where}"
    if spec.order_by:
        q += f" ORDER BY {spec.order_by}"
    return q


def apply_formats(cols: list[Col], raw_rows) -> list[list]:
    out = []
    for row in raw_rows:
        out.append([emitter.format_value(v, c.fmt) for v, c in zip(row, cols)])
    return out


def run_section(conn, spec: SectionSpec, ctx=None) -> str:
    """Execute a spec against the DB and return its emitted section text."""
    headers = [c.legacy for c in spec.cols]
    if spec.custom is not None:
        rows = spec.custom(conn, ctx)
        return emitter.emit_section(spec.name, spec.variant, headers, rows)
    cur = conn.cursor()
    cur.execute(build_query(spec))
    raw = cur.fetchall()
    cur.close()
    rows = apply_formats(spec.cols, raw)
    return emitter.emit_section(spec.name, spec.variant, headers, rows)
```

> `run_section` already applies `bool01` via `apply_formats`, then passes final values to `emit_section` (which re-runs `format_value` with no fmt — idempotent on strings). For `custom` sections the callable returns already-final rows.

- [ ] **Step 4: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_emitter.py -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/registry.py tests/test_ro_input_emitter.py
git commit -m "feat(engine-server): ro_input registry SectionSpec/Col + SQL runner

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 0.4: Golden file parser (harness)

**Files:**
- Create: `engine-server/F8/ro_input_builder/golden.py`
- Test: `engine-server/tests/test_ro_input_emitter.py` (extend)

- [ ] **Step 1: Write the failing test**

Append to `engine-server/tests/test_ro_input_emitter.py`:

```python
from F8.ro_input_builder import golden

GOLDEN = "complete/F8/6_20260612_125629/ro_input.txt"


def test_parse_golden_extracts_known_sections():
    secs = golden.parse_file(GOLDEN)
    # variant-qualified keys
    assert "Fleet" in secs
    assert secs["Fleet"].columns[0] == "id"
    assert secs["Fleet"].count == 2
    assert "Crew(COF)" in secs        # the (COF) variant
    assert "RuleParameter(ALL)" in secs


def test_parsed_section_rows_match_count():
    secs = golden.parse_file(GOLDEN)
    fleet = secs["Fleet"]
    assert len(fleet.rows) == fleet.count
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_emitter.py -k "golden or parse" -v`
Expected: FAIL (`module 'golden' not found`).

- [ ] **Step 3: Implement `golden.py`**

```python
"""Parse a legacy ro_input.txt into sections for golden comparison."""
from __future__ import annotations

import re
from dataclasses import dataclass

_HEADER_RE = re.compile(r"^------([A-Za-z]+)\((\d+)\)(?:\(([^)]+)\))?:(.*)$")


@dataclass
class Section:
    name: str
    variant: str | None
    count: int
    columns: list[str]
    rows: list[list[str]]

    @property
    def key(self) -> str:
        return f"{self.name}({self.variant})" if self.variant else self.name


def parse_text(text: str) -> dict[str, Section]:
    sections: dict[str, Section] = {}
    current: Section | None = None
    for line in text.splitlines():
        m = _HEADER_RE.match(line)
        if m:
            name, count, variant, cols = m.group(1), int(m.group(2)), m.group(3), m.group(4)
            current = Section(name, variant, count, cols.split(","), [])
            sections[current.key] = current
        elif current is not None and line != "":
            current.rows.append(line.split("^"))
    return sections


def parse_file(path: str) -> dict[str, Section]:
    with open(path, "r", encoding="utf-8") as f:
        return parse_text(f.read())
```

> The golden's first section (`Workset`) is preceded by a blank line and the file may contain blank separators; rows are only attached after a header is seen, and blank lines are skipped, so inter-section blanks do not corrupt parsing. The leading region before the first `------` header is ignored.

- [ ] **Step 4: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_emitter.py -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/golden.py tests/test_ro_input_emitter.py
git commit -m "feat(engine-server): golden ro_input.txt parser for section comparison

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 0.5: Reference snapshot + static passthrough source

The 6 sourceless sections (`City`, `RankCombinationCriteria`, `RankCombination`, `AssignmentOverlappable`, `GuaranteeFlyHours`, `CalculationManday`) are emitted verbatim from a committed golden snapshot until proper DB sources exist. This keeps the file complete and functionally equivalent.

**Files:**
- Create: `engine-server/F8/ro_input_builder/reference_snapshot/ro_input.reference.txt` (copy of golden)
- Create: `engine-server/F8/ro_input_builder/sections/passthrough.py`
- Test: `engine-server/tests/test_ro_input_emitter.py` (extend)

- [ ] **Step 1: Commit the reference snapshot**

```bash
cp complete/F8/6_20260612_125629/ro_input.txt F8/ro_input_builder/reference_snapshot/ro_input.reference.txt
```

- [ ] **Step 2: Write the failing test**

Append to `engine-server/tests/test_ro_input_emitter.py`:

```python
from F8.ro_input_builder.sections import passthrough


def test_passthrough_returns_golden_rows():
    rows = passthrough.snapshot_rows("CalculationManday")
    assert len(rows) == 9          # golden CalculationManday(9)
    assert all(isinstance(r, list) for r in rows)


def test_passthrough_city_count():
    assert len(passthrough.snapshot_rows("City")) == 55
```

- [ ] **Step 3: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_emitter.py -k passthrough -v`
Expected: FAIL (`module 'passthrough' not found`).

- [ ] **Step 4: Implement `passthrough.py`**

```python
"""Static passthrough source for sections that have no DB table yet.

Reads the committed reference snapshot and returns a section's rows verbatim.
TECH DEBT: replace each with a real DB source as schema support lands.
"""
from __future__ import annotations

import os
from functools import lru_cache

from .. import golden

_SNAPSHOT = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "reference_snapshot", "ro_input.reference.txt",
)

# Sections served from the snapshot, with their golden variant (None unless tagged).
PASSTHROUGH_SECTIONS = {
    "City": None,
    "RankCombinationCriteria": None,
    "RankCombination": None,
    "AssignmentOverlappable": None,
    "GuaranteeFlyHours": None,
    "CalculationManday": None,
}


@lru_cache(maxsize=1)
def _parsed():
    return golden.parse_file(_SNAPSHOT)


def snapshot_rows(section_name: str, variant: str | None = None):
    key = f"{section_name}({variant})" if variant else section_name
    sec = _parsed().get(key)
    if sec is None:
        raise KeyError(f"section {key} not in reference snapshot")
    return [list(r) for r in sec.rows]


def make_custom(section_name: str, variant: str | None = None):
    """Return a custom(conn, ctx) callable for a SectionSpec."""
    def _custom(conn, ctx):
        return snapshot_rows(section_name, variant)
    return _custom
```

- [ ] **Step 5: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_emitter.py -v`
Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git add F8/ro_input_builder/reference_snapshot/ro_input.reference.txt F8/ro_input_builder/sections/passthrough.py tests/test_ro_input_emitter.py
git commit -m "feat(engine-server): static passthrough source for sourceless ro_input sections

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.1: First DB-backed section end-to-end (Fleet) — the canonical pattern

This task establishes the exact pattern every subsequent reference section follows: declare a `SectionSpec`, add a DB-backed golden test that asserts header equality + row-count + business-key set equality.

**Files:**
- Create: `engine-server/F8/ro_input_builder/sections/reference.py`
- Create: `engine-server/tests/test_ro_input_reference_sections.py`

- [ ] **Step 1: Write the failing DB-backed test**

Create `engine-server/tests/test_ro_input_reference_sections.py`:

```python
import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden
from F8.ro_input_builder.sections import reference

GOLDEN = "complete/F8/6_20260612_125629/ro_input.txt"


@pytest.fixture(scope="module")
def conn():
    try:
        c = db.connect("f8")
    except psycopg2.OperationalError as e:
        pytest.skip(f"f8 DB unavailable: {e}")
    yield c
    c.close()


@pytest.fixture(scope="module")
def gold():
    return golden.parse_file(GOLDEN)


def _emit(conn, spec):
    return golden.parse_text(registry.run_section(conn, spec))[spec.name
        if not spec.variant else f"{spec.name}({spec.variant})"]


def test_fleet_header_matches_golden(conn, gold):
    sec = _emit(conn, reference.FLEET)
    assert sec.columns == gold["Fleet"].columns


def test_fleet_business_keys_match_golden(conn, gold):
    sec = _emit(conn, reference.FLEET)
    got = {tuple(r[1:4]) for r in sec.rows}        # acType, fleetGrp, fleet
    want = {tuple(r[1:4]) for r in gold["Fleet"].rows}
    assert got == want
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_reference_sections.py -v`
Expected: FAIL (`module 'reference' has no attribute 'FLEET'`) — or SKIP if DB down (then start the f8 DB before proceeding; §No-Illusion requires a real pass).

- [ ] **Step 3: Implement `reference.py` with the Fleet spec**

```python
"""P1 direct-map reference SectionSpecs. Column maps from mapping research."""
from __future__ import annotations

from ..registry import SectionSpec, Col

FLEET = SectionSpec(
    name="Fleet", table="fleet", order_by="id",
    cols=[
        Col("id", "id"), Col("acType", "ac_type"), Col("fleetGrp", "fleet_grp"),
        Col("fleet", "fleet"), Col("description", "description"),
        Col("displayOrder", "display_order"), Col("restfacility", "restfacility"),
        Col("body", "body"), Col("marketAcType", "market_ac_type"),
        Col("ccRestFacility", None),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)
```

- [ ] **Step 4: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_reference_sections.py -v`
Expected: 2 passed. If the golden header differs from `[c.legacy for c in FLEET.cols]`, fix the `cols` order to match the golden header exactly (golden header is authoritative).

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/sections/reference.py tests/test_ro_input_reference_sections.py
git commit -m "feat(engine-server): Fleet reference section (canonical DB-backed pattern)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.2: Remaining clean-map reference sections

Add one `SectionSpec` per section to `reference.py` using the exact `Col` maps below (from mapping research; golden header is authoritative for order — if a header differs, reorder `cols` to match). For each, add a header-equality test and a business-key-set test mirroring Task 1.1.

**Files:**
- Modify: `engine-server/F8/ro_input_builder/sections/reference.py`
- Modify: `engine-server/tests/test_ro_input_reference_sections.py`

- [ ] **Step 1: Append all specs to `reference.py`**

```python
AIRPORT = SectionSpec(
    name="Airport", table="airport", order_by="id",
    cols=[
        Col("id", "id"), Col("airport", "airport"), Col("airportName", "airport_name"),
        Col("airportNativeName", "airport_native_name"), Col("airportIcao", "airport_icao"),
        Col("country", "country"), Col("airportAbbr", "airport_abbr"), Col("city", "city"),
        Col("category", "category"), Col("dir", "dir"), Col("zoneId", "zone_id"),
        Col("utcStandardOffset", "utc_standard_offset"), Col("dstGrp", "dst_grp"),
        Col("plateauType", "plateau_type"), Col("cats", "cats"), Col("rnp", "rnp"),
        Col("latitude", "latitude"), Col("longitude", "longitude"),
        Col("inPhone", "in_phone"), Col("outPhone", "out_phone"), Col("state", "state"),
        Col("icRoute", "ic_route"), Col("email", "email"), Col("countryName", None),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

BASE = SectionSpec(
    name="Base", table="base", order_by="id",
    cols=[
        Col("id", "id"), Col("filiale", "filiale"), Col("base", "base"), Col("name", "name"),
        Col("displayOrder", "display_order"),
        Col("isPrimeDisplayBase", "is_prime_display_base", fmt="bool01"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

RANK = SectionSpec(
    name="Rank", table="rank", order_by="id",
    cols=[
        Col("id", "id"), Col("rank", "rank"), Col("division", "division"),
        Col("displayOrder", "display_order"), Col("description", "description"),
        Col("isIncludeInFt", "is_include_in_ft", fmt="bool01"),
        Col("isActingRank", "is_acting_rank", fmt="bool01"),
        Col("isCrewRank", "is_crew_rank", fmt="bool01"),
        Col("isMustCrewRank", "is_must_crew_rank", fmt="bool01"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

RANK_ACTING = SectionSpec(
    name="RankActing", table="rank_acting", order_by="id",
    cols=[
        Col("id", "id"), Col("filiale", "filiale"), Col("activeRank", "active_rank"),
        Col("actingRank", "acting_rank"), Col("qual", "qual"), Col("rankId", None),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

RANK_POSITION = SectionSpec(
    name="RankPosition", table="rank_position", order_by="id",
    cols=[
        Col("id", "id"), Col("rankId", None), Col("position", "position"),
        Col("division", "division"), Col("displayOrder", "display_order"),
        Col("description", "description"), Col("rank", "rank"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

COMPOSITION = SectionSpec(
    name="Composition", table="composition", order_by="id",
    cols=[
        Col("id", "id"), Col("filiale", "filiale"), Col("name", "name"),
        Col("nameDesc", "name_desc"), Col("division", "division"),
        Col("displayOrder", "display_order"), Col("hierarchy", "hierarchy"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

COMPOSITION_RANK = SectionSpec(
    name="CompositionRank", table="composition_rank", order_by="id",
    cols=[
        Col("id", "id"), Col("compId", "comp_id"), Col("rankId", None),
        Col("planValue", "plan_value"), Col("planValueExtra", "plan_value_extra"),
        Col("options", "options"), Col("rank", "rank"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

TEAM = SectionSpec(
    name="Team", table="team", order_by="id",
    cols=[
        Col("id", "id"), Col("team", "team"), Col("filiale", "filiale"),
        Col("description", "description"), Col("displayOrder", "display_order"),
        Col("headColor", "head_color"), Col("division", "division"),
        Col("teamGroup", "team_group"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

DICTIONARY = SectionSpec(
    name="Dictionary", table="dictionary", order_by="id",
    where="parent_code IS DISTINCT FROM 'SYS_PARAM'",
    cols=[
        Col("id", "id"), Col("parentCode", "parent_code"), Col("code", "code"),
        Col("codeValue", "code_value"), Col("name", "name"), Col("idx", "idx"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

SYSTEM_PARAMETER = SectionSpec(
    name="SystemParameter", table="dictionary", order_by="id",
    where="parent_code = 'SYS_PARAM'",
    cols=[
        Col("id", "id"), Col("paramName", "code"), Col("paramValues", "code_value"),
        Col("appIds", None), Col("paramDesc", "name"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

ASSIGNMENT = SectionSpec(
    name="Assignment", table="assignment", order_by="id",
    cols=[
        Col("id", "id"), Col("assignment", "assignment"), Col("description", "description"),
        Col("label", "label"), Col("type", "type"), Col("standalone", "standalone"),
        Col("defaultLocation", "default_location"),
        Col("defaultAssignmentGroup", "default_assignment_group"),
        Col("colorHex", "color_hex"), Col("fixedDurationMin", "fixed_duration_min"),
        Col("beforePctDpGapMin", "before_pct_dp_gap_min"),
        Col("fixedStrTm", "fixed_str_tm"), Col("fixedEndTm", "fixed_end_tm"),
        Col("btPct", "bt_pct"), Col("creditPct", "credit_pct"), Col("fdpPct", "fdp_pct"),
        Col("dpPct", "dp_pct"), Col("ftPct", "ft_pct"),
        Col("displayLabelWhenAvailable", "display_label_when_available"),
        Col("recaLabel", "reca_label"),
        Col("isAdhoc", "is_adhoc", fmt="bool01"),
        Col("isRecency", "is_recency", fmt="bool01"),
        Col("isQualifier", "is_qualifier", fmt="bool01"),
        Col("wpPct", "wp_pct"), Col("restTime", "rest_time"),
        Col("divideCrewManday", "divide_crew_manday"), Col("orientation", "orientation"),
        Col("pairingLabelColorHex", "pairing_label_color_hex"),
        Col("segmentLabelColorHex", "segment_label_color_hex"), Col("dpGap", "dp_gap"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

ASSIGNMENT_GROUP = SectionSpec(
    name="AssignmentGroup", table="assignment_group", order_by="id",
    cols=[
        Col("id", "id"), Col("assignmentGroup", "assignment_group"), Col("name", "name"),
        Col("optimizerIndicator", "optimizer_indicator"),
        Col("allowOverlap", "allow_overlap"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

ASSIGNMENT_GROUP_MAP = SectionSpec(
    name="AssignmentGroupMap", table="assignment_group_map", order_by="id",
    cols=[
        Col("id", "id"), Col("assignmentGroupId", "assignment_group_id"),
        Col("assignmentId", "assignment_id"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

PANE_HEADER = SectionSpec(
    name="PaneHeader", table="pane_header", order_by="id",
    cols=[
        Col("id", "id"), Col("pane", "pane"), Col("kpi", "kpi"),
        Col("isDisplay", "is_display"), Col("positionIndex", "position_index"),
        Col("expectedFormat", "expected_format"), Col("remark", "remark"),
        Col("width", "width"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)

ROSTER_PERIOD = SectionSpec(
    name="RosterPeriod", table="roster_period", order_by="id",
    cols=[
        Col("id", "id"), Col("year", "year"), Col("name", "name"),
        Col("rosterPeriod", "roster_period"), Col("rpStart", "rp_start"),
        Col("rpEnd", "rp_end"),
        Col("rosterPublicationDate", "roster_publication_date"),
        Col("paidDate", "paid_date"), Col("lockStatus", "lock_status"),
        Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
    ],
)
```

- [ ] **Step 2: Add a parametrized golden header test**

Append to `engine-server/tests/test_ro_input_reference_sections.py`:

```python
CLEAN_SPECS = [
    ("Airport", reference.AIRPORT), ("Base", reference.BASE), ("Rank", reference.RANK),
    ("RankActing", reference.RANK_ACTING), ("RankPosition", reference.RANK_POSITION),
    ("Composition", reference.COMPOSITION), ("CompositionRank", reference.COMPOSITION_RANK),
    ("Team", reference.TEAM), ("Dictionary", reference.DICTIONARY),
    ("SystemParameter", reference.SYSTEM_PARAMETER), ("Assignment", reference.ASSIGNMENT),
    ("AssignmentGroup", reference.ASSIGNMENT_GROUP),
    ("AssignmentGroupMap", reference.ASSIGNMENT_GROUP_MAP),
    ("PaneHeader", reference.PANE_HEADER), ("RosterPeriod", reference.ROSTER_PERIOD),
]


@pytest.mark.parametrize("name,spec", CLEAN_SPECS)
def test_clean_section_header_matches_golden(conn, gold, name, spec):
    # Airport appears twice in golden (Client + full); compare against the full one.
    sec = _emit(conn, spec)
    assert sec.columns == gold[name].columns
```

> `Airport` and `Assignment` appear twice in the golden (variant `(Client)`/`(Read)` and a plain instance). `gold["Airport"]` resolves to the **plain** (non-variant) key — the full 4522-row Airport and the 85-row plain Assignment. The variant copies (`Airport(Client)` 55 rows, `Assignment(Read)`) are handled in P8 assembly when section order/duplication is finalized; here we validate the plain instance only.

- [ ] **Step 3: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_reference_sections.py -v`
Expected: all passed (16 header tests + Fleet's 2). Any header mismatch → reorder that spec's `cols` to match the golden header exactly, re-run.

- [ ] **Step 4: Commit**

```bash
git add F8/ro_input_builder/sections/reference.py tests/test_ro_input_reference_sections.py
git commit -m "feat(engine-server): P1 clean-map reference sections (15) + golden header tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.3: CLI entry point (partial assembly of P1 sections)

**Files:**
- Create: `engine-server/F8/ro_input_builder/cli.py`
- Create: `engine-server/F8/ro_input_builder/__main__.py`
- Modify: `engine-server/F8/ro_input_builder/registry.py` (add `P1_REGISTRY`)
- Test: `engine-server/tests/test_ro_input_reference_sections.py` (extend)

- [ ] **Step 1: Write the failing test**

Append to `engine-server/tests/test_ro_input_reference_sections.py`:

```python
from F8.ro_input_builder import cli


def test_cli_build_p1_emits_all_sections(conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p1")
    text = out.read_text()
    for marker in ["------Fleet(", "------Airport(", "------City(",
                   "------CalculationManday(", "------SystemParameter("]:
        assert marker in text
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_reference_sections.py -k cli -v`
Expected: FAIL (`module 'cli' not found`).

- [ ] **Step 3: Add `P1_REGISTRY` to `registry.py`**

Append to `registry.py`:

```python
def _snapshot_cols(section_name: str) -> list[str]:
    from .sections import passthrough as pt
    from . import golden
    secs = golden.parse_file(pt._SNAPSHOT)
    return secs[section_name].columns


def p1_registry() -> list[SectionSpec]:
    """Ordered P1 sections: clean-map + static-passthrough. Order is provisional;
    full golden order is fixed in P8 assembly."""
    from .sections import reference as ref
    from .sections import passthrough as pt
    clean = [
        ref.AIRPORT, ref.FLEET, ref.BASE, ref.RANK, ref.RANK_ACTING, ref.RANK_POSITION,
        ref.COMPOSITION, ref.COMPOSITION_RANK, ref.TEAM, ref.DICTIONARY,
        ref.SYSTEM_PARAMETER, ref.ASSIGNMENT, ref.ASSIGNMENT_GROUP,
        ref.ASSIGNMENT_GROUP_MAP, ref.PANE_HEADER, ref.ROSTER_PERIOD,
    ]
    passthru = [
        SectionSpec(name=n, cols=[Col(c) for c in _snapshot_cols(n)],
                    custom=pt.make_custom(n))
        for n in pt.PASSTHROUGH_SECTIONS
    ]
    return clean + passthru
```

- [ ] **Step 4: Implement `cli.py` and `__main__.py`**

`cli.py`:

```python
"""CLI: build ro_input.txt (and optional gz) from PostgreSQL."""
from __future__ import annotations

import argparse
import gzip
import sys

from . import db, registry


def build(airline: str, scenario: int, out_path: str,
          registry_name: str = "p1", gz_path: str | None = None,
          db_url: str | None = None) -> None:
    specs = {"p1": registry.p1_registry}[registry_name]()
    conn = db.connect(airline, db_url)
    ctx = {"airline": airline, "scenario": scenario}
    try:
        parts = [registry.run_section(conn, s, ctx) for s in specs]
    finally:
        conn.close()
    text = "".join(parts)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    if gz_path:
        with gzip.open(gz_path, "wb") as f:
            f.write(text.encode("utf-8"))


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="F8.ro_input_builder")
    p.add_argument("--airline", required=True)
    p.add_argument("--scenario", type=int, required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--gz")
    p.add_argument("--registry", default="p1")
    p.add_argument("--db-url")
    a = p.parse_args(argv)
    build(a.airline, a.scenario, a.out, a.registry, a.gz, a.db_url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

`__main__.py`:

```python
import sys
from .cli import main

sys.exit(main())
```

- [ ] **Step 5: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_reference_sections.py -v`
Expected: all passed.

- [ ] **Step 6: Smoke-test the CLI**

Run: `$PY -m F8.ro_input_builder --airline f8 --scenario 6 --out /tmp/p1.txt --gz /tmp/p1.gz && grep -c '^------' /tmp/p1.txt`
Expected: prints `22` (16 clean + 6 passthrough). Confirm `zcat /tmp/p1.gz | head -1` shows the first section header.

- [ ] **Step 7: Commit**

```bash
git add F8/ro_input_builder/cli.py F8/ro_input_builder/__main__.py F8/ro_input_builder/registry.py tests/test_ro_input_reference_sections.py
git commit -m "feat(engine-server): ro_input_builder CLI + P1 registry assembly

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1.4: Bump backend version

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Read current value**

Run: `grep BACKEND_VERSION /home/yuan.z/rois/rois-ai/gantt/src/version.ts`

- [ ] **Step 2: Increment `BACKEND_VERSION` by 1**

Edit `gantt/src/version.ts`: set `BACKEND_VERSION` to current + 1 (engine-server code changed).

- [ ] **Step 3: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add gantt/src/version.ts
git commit -m "chore: BACKEND_VERSION +1 (ro_input_builder P0+P1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria for P0+P1

- `$PY -m pytest tests/test_ro_input_emitter.py tests/test_ro_input_reference_sections.py -v` → all pass (DB-backed tests require the f8 DB up; they skip cleanly if not).
- `$PY -m F8.ro_input_builder --airline f8 --scenario 6 --out /tmp/p1.txt` produces 22 well-formed sections whose headers match the golden.
- The 6 sourceless sections emit from the committed snapshot (tagged tech-debt in `passthrough.py`).

## Not in this plan (subsequent per-phase plans)

- **task_manager toggle** (`inputSource: db|java`) and `_generate_input_from_db()` wiring — deferred to the P8 assembly plan, since it should switch over a *complete* file, not a partial P1 file.
- P2 Crew domain (+ COF scoping), P3 Flight, P4 Rules, P5 Pairing layer (duty/node reconstruction), P6 Roster, P7 computed/manday, P8 full golden-order assembly + end-to-end optimizer run + default flip.
- Replacing the 6 static-passthrough sections with real DB sources (or new config tables) — tracked as tech-debt.

---

## Self-review notes

- Spec coverage: P0 framework (emitter/registry/golden/db/CLI/passthrough) ✔; P1 reference sections (all 22 from spec §5 "direct-map reference") ✔. Crew/Flight/Rules/Pairing/Roster/Computed explicitly deferred to later plans ✔. Toggle deferred to P8 (justified) ✔.
- Sourceless-section discovery (City, RankCombination*, AssignmentOverlappable, GuaranteeFlyHours, CalculationManday) handled via passthrough, not silently dropped ✔.
- Type consistency: `Col`/`SectionSpec`/`run_section`/`emit_section`/`parse_text`/`parse_file`/`make_custom`/`p1_registry` names are used identically across tasks ✔.
- Known authoritative-override: where a spec's `cols` order disagrees with the golden header, the golden header wins — each section test asserts header equality to force this.

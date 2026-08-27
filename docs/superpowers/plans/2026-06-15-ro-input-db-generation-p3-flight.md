# RO Input DB Generation — P3 (Flight + FlightComposition) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Emit the `Flight` and `FlightComposition` sections from PostgreSQL, scoped by the scenario date window, reusing the P0 framework + P2 context.

**Architecture:** Add `context.flight_section_ids()` — all live flights in the buffered scenario window `[str−9d, end+9d)`, **no fleet filter** (the legacy exporter included all fleets + reserve aircraft). Both sections are `custom` `SectionSpec`s: `Flight` filters `flight` by that id set; `FlightComposition` filters `flight_composition` by `flt_id` in that set.

**Tech Stack:** Python 3.12, psycopg2, pytest. Builds on `engine-server/F8/ro_input_builder/` (P0–P2, merged).

**Spec:** `docs/superpowers/specs/2026-06-15-ro-input-db-generation-design.md`
**Golden:** `engine-server/complete/F8/6_20260612_125629/ro_input.txt`

**Run from `engine-server/`.** `PY=/home/yuan.z/rois/rois-ai/ro-engine/.venv/bin/python`. **Export before every DB test (else skip — must PASS):**
```bash
export LEGACY_RO_DB_URL='postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8'
```

---

## Key facts (verified)

- **The f8 DB was reseeded after the 2026-06-12 golden snapshot.** Golden flight IDs (58k–73k) have ~0 overlap with current flights. So **Flight cannot content- or count-match the golden**; ~1744 live flights exist in scenario 6's window now. Validation is **structural** (header + non-empty + every row in window). The P8 optimizer run is the functional gate.
- Golden `Flight(4108)` scope: `flt_dt ∈ [2026-05-23, 2026-07-08]` = `[str_dt_loc−9d, end_dt_loc+9d)`, **no fleet filter** (included `7M8`, `737`, `73H`, reserve `-`).
- `flight_composition` table is **currently empty** (0 rows) → `FlightComposition` emits 0 rows today. Builder is correct; this is a data-seeding gap (same class as the P1 under-seeded tables). When seeded, it scopes by `flt_id` in the Flight set.
- Cross-cutting: `id→id`, `lastModified→updated_at`, `modifiedBy→updated_by`. `createdDt→created_at` (legacy `Dt`/DB `_at`). bool01: `voyageStatus`, `isLocked`, `isDeleted`.

---

## File Structure

```
engine-server/F8/ro_input_builder/
  context.py          # MODIFY: add flight_section_ids()
  sections/flight.py  # NEW: FLIGHT, FLIGHT_COMPOSITION specs
  registry.py         # MODIFY: add p3_registry()
  cli.py              # MODIFY: wire "p3"
engine-server/tests/
  test_ro_input_flight_sections.py  # NEW
  test_ro_input_reference_sections.py  # MODIFY: p3 CLI test
```

---

## Task 3.0: Flight window helper + Flight section

**Files:** Modify `engine-server/F8/ro_input_builder/context.py`; Create `engine-server/F8/ro_input_builder/sections/flight.py`; Create `engine-server/tests/test_ro_input_flight_sections.py`.

- [ ] **Step 1: Write the failing tests** — create `engine-server/tests/test_ro_input_flight_sections.py`:

```python
import datetime
import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden, context
from F8.ro_input_builder.sections import flight

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
    ctx = {"airline": "f8", "scenario": 6}
    text = registry.run_section(conn, spec, ctx)
    return golden.parse_text(text)[spec.name]


def test_flight_header_matches_golden(conn, gold):
    assert _emit(conn, flight.FLIGHT).columns == gold["Flight"].columns


def test_flight_nonempty_and_in_window(conn):
    ctx = {"airline": "f8", "scenario": 6}
    sc = context.get_scenario(conn, ctx)
    lo = sc["start"] - datetime.timedelta(days=9)
    hi = sc["end"] + datetime.timedelta(days=9)
    sec = _emit(conn, flight.FLIGHT)
    assert sec.rows, "Flight section must be non-empty (live flights in window)"
    di = sec.columns.index("fltDt")
    for r in sec.rows:
        d = datetime.date.fromisoformat(r[di][:10])
        assert lo.date() <= d < hi.date()
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_flight_sections.py -v` → FAIL (`module 'flight' not found` / `flight_section_ids` missing). Must fail, not skip.

- [ ] **Step 3: Add `flight_section_ids` to `engine-server/F8/ro_input_builder/context.py`** (append after `flight_pool_ids`)

```python
def flight_section_ids(conn, ctx) -> list[int]:
    """Flight ids for the Flight SECTION: all live flights in [str-9d, end+9d),
    NO fleet filter (the legacy exporter included all fleets + reserve). Distinct
    from flight_pool_ids (which is fleet-filtered, for the COF crew set)."""
    c = _cache(ctx)
    if "flight_section_ids" in c:
        return c["flight_section_ids"]
    sc = get_scenario(conn, ctx)
    lo = sc["start"] - timedelta(days=9)
    hi = sc["end"] + timedelta(days=9)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT f.id FROM flight f
        WHERE f.flt_dt >= %(lo)s AND f.flt_dt < %(hi)s
          AND (f.scenario_id = 0 OR f.scenario_id IS NULL)
          AND (f.is_deleted = 0 OR f.is_deleted IS NULL)
        """,
        {"lo": lo, "hi": hi},
    )
    ids = [r[0] for r in cur.fetchall()]
    cur.close()
    c["flight_section_ids"] = ids
    return ids
```

- [ ] **Step 4: Create `engine-server/F8/ro_input_builder/sections/flight.py`** with the `FLIGHT` spec

```python
"""Flight + FlightComposition SectionSpecs, scoped to the scenario flight window."""
from __future__ import annotations

from ..registry import SectionSpec, Col
from .. import registry as _reg
from .. import context

_FLIGHT_COLS = [
    Col("id", "id"), Col("schId", "sch_id"), Col("fltDt", "flt_dt"),
    Col("fltDtUtc", "flt_dt_utc"), Col("airline", "airline"), Col("fltNum", "flt_num"),
    Col("suffix", "suffix"), Col("depArp", "dep_arp"),
    Col("schDepDtUtc", "sch_dep_dt_utc"), Col("arvArp", "arv_arp"),
    Col("schArvDtUtc", "sch_arv_dt_utc"), Col("price", "price"),
    Col("blkMin", "blk_min"), Col("fleet", "fleet"),
    Col("onwardFltNum", "onward_flt_num"), Col("register", "register"),
    Col("acOwner", "ac_owner"), Col("pilotOwner", "pilot_owner"),
    Col("cabinOwner", "cabin_owner"), Col("airmarshalOwner", "airmarshal_owner"),
    Col("flightFlag", "flight_flag"), Col("serviceType", "service_type"),
    Col("flightAssignment", "flight_assignment"), Col("commuteId", "commute_id"),
    Col("segType", "seg_type"), Col("fltType", "flt_type"), Col("fltSts", "flt_sts"),
    Col("fltVr", "flt_vr"), Col("estDepDtUtc", "est_dep_dt_utc"),
    Col("estArvDtUtc", "est_arv_dt_utc"), Col("actTaxiOutUtc", "act_taxi_out_utc"),
    Col("actTakeOffUtc", "act_take_off_utc"), Col("actTouchDownUtc", "act_touch_down_utc"),
    Col("actTaxiInUtc", "act_taxi_in_utc"), Col("actDepArp", "act_dep_arp"),
    Col("actDepDtUtc", "act_dep_dt_utc"), Col("actArvArp", "act_arv_arp"),
    Col("actArvDtUtc", "act_arv_dt_utc"),
    Col("voyageStatus", "voyage_status", fmt="bool01"),
    Col("isLocked", "is_locked", fmt="bool01"),
    Col("interfaceFltId", "interface_flt_id"), Col("createdBy", "created_by"),
    Col("createdDt", "created_at"), Col("vrAdd", "vr_add"), Col("liveId", "live_id"),
    Col("etdChgTm", "etd_chg_tm"), Col("fltDelayNotifyUtc", "flt_delay_notify_utc"),
    Col("fltLastDelayEtdUtc", "flt_last_delay_etd_utc"), Col("courseCode", "course_code"),
    Col("deviceCode", "device_code"), Col("flightKey", "flight_key"),
    Col("payFlyHours", "pay_fly_hours"), Col("actDoorClosedUtc", "act_door_closed_utc"),
    Col("actDoorOpenUtc", "act_door_open_utc"), Col("originFltDtUtc", "origin_flt_dt_utc"),
    Col("originInterfaceFltId", "origin_interface_flt_id"), Col("remark", "remark"),
    Col("subFleet", "sub_fleet"), Col("legNo", "leg_no"), Col("reserveSeq", None),
    Col("apisStage", "apis_stage"), Col("source", None),
    Col("isDeleted", "is_deleted", fmt="bool01"), Col("initialInterfaceFltId", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _flight(conn, ctx):
    ids = context.flight_section_ids(conn, ctx)
    if not ids:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_FLIGHT_COLS)} FROM flight "
        f"WHERE id = ANY(%s) ORDER BY id",
        (ids,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_FLIGHT_COLS, raw)


FLIGHT = SectionSpec(name="Flight", cols=_FLIGHT_COLS, custom=_flight)
```

- [ ] **Step 5: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_flight_sections.py -v` → 2 passed.
If `test_flight_header_matches_golden` fails, fetch `grep -n "^------Flight(" complete/F8/6_20260612_125629/ro_input.txt`, read the exact column list, and align `_FLIGHT_COLS` legacy names/order. If a mapped DB column raises UndefinedColumn, fix the name (check `information_schema`) or set db=None and report.

- [ ] **Step 6: Commit**

```bash
git add F8/ro_input_builder/context.py F8/ro_input_builder/sections/flight.py tests/test_ro_input_flight_sections.py
git commit -m "feat(engine-server): Flight section + flight-window scope (P3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3.1: FlightComposition section

`flight_composition` is currently empty (data gap) → this section emits 0 rows today, but the spec + scope are correct for when it is seeded. Test validates the header only (an empty section cannot assert content; documented per §No-Illusion).

**Files:** Modify `engine-server/F8/ro_input_builder/sections/flight.py`; Modify `engine-server/tests/test_ro_input_flight_sections.py`.

- [ ] **Step 1: Append the failing test**

```python
def test_flight_composition_header_matches_golden(conn, gold):
    sec = _emit(conn, flight.FLIGHT_COMPOSITION)
    assert sec.columns == gold["FlightComposition"].columns


def test_flight_composition_rows_scoped_to_flight_set(conn):
    # flight_composition is currently empty (data gap); if/when populated, every
    # emitted row's fltId must be within the Flight window set. Passes (vacuously)
    # while empty; becomes a real guard once seeded.
    ctx = {"airline": "f8", "scenario": 6}
    pool = set(context.flight_section_ids(conn, ctx))
    sec = _emit(conn, flight.FLIGHT_COMPOSITION)
    fi = sec.columns.index("fltId")
    assert all(int(r[fi]) in pool for r in sec.rows)
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_flight_sections.py -k composition -v` → FAIL (`FLIGHT_COMPOSITION` missing).

- [ ] **Step 3: Append to `engine-server/F8/ro_input_builder/sections/flight.py`**

```python
_FLIGHT_COMP_COLS = [
    Col("id", "id"), Col("pairingScenarioId", "scenario_id"), Col("fltId", "flt_id"),
    Col("division", "division"), Col("actingRank", "acting_rank"),
    Col("planValue", "plan"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _flight_composition(conn, ctx):
    ids = context.flight_section_ids(conn, ctx)
    if not ids:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_FLIGHT_COMP_COLS)} FROM flight_composition "
        f"WHERE flt_id = ANY(%s) ORDER BY id",
        (ids,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_FLIGHT_COMP_COLS, raw)


FLIGHT_COMPOSITION = SectionSpec(
    name="FlightComposition", cols=_FLIGHT_COMP_COLS, custom=_flight_composition,
)
```

> If the header test fails, fetch `grep -n "^------FlightComposition(" complete/F8/6_20260612_125629/ro_input.txt` and align. If `flight_composition` lacks `scenario_id` or `plan` (UndefinedColumn), check `information_schema` for the real names; the investigation confirmed `scenario_id`, `flt_id`, `division`, `acting_rank`, `plan` exist.

- [ ] **Step 4: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_flight_sections.py -v` → 4 passed. (FlightComposition emits 0 rows while the table is empty — the header test still validates the column contract.)

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/sections/flight.py tests/test_ro_input_flight_sections.py
git commit -m "feat(engine-server): FlightComposition section (data-gap noted: table empty) (P3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3.2: Register P3 + version bump

**Files:** Modify `engine-server/F8/ro_input_builder/registry.py`, `cli.py`, `tests/test_ro_input_reference_sections.py`, `gantt/src/version.ts`.

- [ ] **Step 1: Append the failing CLI test** to `engine-server/tests/test_ro_input_reference_sections.py`:

```python
def test_cli_build_p3_emits_flight_sections(conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p3")
    text = out.read_text()
    for marker in ["------Flight(", "------FlightComposition(", "------Crew(", "------Fleet("]:
        assert marker in text
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_reference_sections.py -k p3 -v` → FAIL (KeyError 'p3').

- [ ] **Step 3: Add `p3_registry()` to `registry.py`** (append at end)

```python
def p3_registry() -> list[SectionSpec]:
    """P2 sections plus Flight + FlightComposition. Order provisional (P8 fixes it)."""
    from .sections import flight as fl
    return p2_registry() + [fl.FLIGHT, fl.FLIGHT_COMPOSITION]
```

- [ ] **Step 4: Wire `"p3"` into `cli.py`** — change the registry map line to:

```python
    specs = {"p1": registry.p1_registry, "p2": registry.p2_registry,
             "p3": registry.p3_registry}[registry_name]()
```

- [ ] **Step 5: Run to verify pass + smoke test**

```bash
$PY -m pytest tests/test_ro_input_reference_sections.py -v
$PY -m F8.ro_input_builder --airline f8 --scenario 6 --out /tmp/p3.txt --registry p3
grep -c '^------' /tmp/p3.txt                       # expect 39 (37 P2 + 2)
grep -E '^------Flight\(|^------FlightComposition\(' /tmp/p3.txt
```
Expected: tests pass; 39 sections; `Flight(N)` with N≈1744 (live, NOT golden 4108 — DB reseed); `FlightComposition(0)` (empty table — data gap).

- [ ] **Step 6: Bump `BACKEND_VERSION`** in `gantt/src/version.ts` (95 → 96).

- [ ] **Step 7: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add engine-server/F8/ro_input_builder/registry.py engine-server/F8/ro_input_builder/cli.py engine-server/tests/test_ro_input_reference_sections.py gantt/src/version.ts
git commit -m "feat(engine-server): P3 registry assembly (Flight) + BACKEND_VERSION 96

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria for P3

- `$PY -m pytest tests/test_ro_input_flight_sections.py tests/test_ro_input_reference_sections.py -v` → all pass.
- `Flight` header matches golden; all emitted flights within the window; `--registry p3` emits 39 sections.

## Known limitations (per §No-Illusion)

- **The f8 DB was reseeded after the golden snapshot** → `Flight` content/count cannot match the golden (different flights now). P3 validates structure (header + window scoping); the P8 optimizer run is the functional gate.
- **`flight_composition` is empty** → `FlightComposition` emits 0 rows. Spec + scoping are correct; this is a data-seeding gap (revisit in P8 / seeding). If the optimizer requires per-flight composition, P8 decides whether to derive it from pairing data.
- The Flight window buffer (±9d) matches the observed golden span; revisit against the optimizer in P8.

## Self-review

- Spec coverage: Flight + FlightComposition (spec §5 "Flight") ✔. Scope rule resolved (window, no fleet filter) ✔.
- Type consistency: `flight_section_ids`/`get_scenario`/`select_list`/`apply_formats`/`run_section`/`p2_registry`/`p3_registry` consistent ✔.
- No placeholders: full Col lists, runnable steps ✔.

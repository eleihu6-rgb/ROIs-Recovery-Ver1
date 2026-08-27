# RO Input DB Generation — P6 (Roster) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Emit `RosterFlight`, `RosterGround`, and `Roster` from PostgreSQL. All three derive from the single `roster_flight` table, scoped to the scenario crew set + window.

**Architecture:** `RosterFlight` ← `roster_flight WHERE pairing_id IS NOT NULL` (+ a scalar subquery for `pairingStartUtc`). `RosterGround` ← `roster_flight WHERE pairing_id IS NULL`. `Roster` (the old pairing-level table, gone in the new schema) ← reconstructed by `GROUP BY (crew_id, pairing_id)` with `MIN(id)` synthetic id, `MIN(act_str_dt_utc)`/`MAX(act_end_dt_utc)` time aggregates. All custom builders, scoped to `context.scenario_crew_ids` + the scenario window.

**Tech Stack:** Python 3.12, psycopg2, pytest. Builds on `engine-server/F8/ro_input_builder/` (P0–P5, merged).

**Spec:** `docs/superpowers/specs/2026-06-15-ro-input-db-generation-design.md`
**Golden:** `engine-server/complete/F8/6_20260612_125629/ro_input.txt`

**Run from `engine-server/`.** `PY=/home/yuan.z/rois/rois-ai/ro-engine/.venv/bin/python`. **Export before every DB test (else skip — must PASS):**
```bash
export LEGACY_RO_DB_URL='postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8'
```

---

## Key facts (verified)

- No `roster` or `roster_ground` table — all three come from `roster_flight`. Ground rows = `pairing_id IS NULL` (CLAUDE.md rule); flight rows = `pairing_id IS NOT NULL`.
- Scope: `scenario_id=0`, `crew_id = ANY(scenario_crew_ids)` (the 26, reproduced exactly in P2), `is_deleted=0`, within the window `[str_dt_loc−9d, end_dt_loc+9d)`. DB reseed → counts won't match golden (live RF≈708, RG≈654, Roster≈ window-scoped; golden 153/297/38) — **structural validation**; P8 optimizer run is the gate.
- **RosterFlight traps:** `actingRank→flight_acting_rank`, `subParentTmProgramCourseId→sub_parent_tm_program_id`, `pairingStartUtc` = scalar subquery `(SELECT sch_str_dt_utc FROM pairing WHERE id = roster_flight.pairing_id)`. UNMAPPED: `dutyId`, `rosterId`, `isAgreeWork`, `actionDtUtc`.
- **RosterGround:** `location→dep_arp`, `strDtUtc→sch_str_dt_utc`, `endDtUtc→sch_end_dt_utc`, `dpMin→act_credited_minutes`. Many UNMAPPED (isLocked, restEndDtUtc, remarks, filiale, isVolunteer, isPush, transactionId, notification*, callOut*, isAcknowledged, isAgreeWork, autoLabel, actionDtUtc).
- **Roster:** 1 row per `(crew_id, pairing_id)` (pairing_id NOT NULL). `id=MIN(id)`, `actStrDtUtc=MIN(act_str_dt_utc)`, `actEndDtUtc=MAX(act_end_dt_utc)`, all other mapped cols `MIN()`. UNMAPPED: liveId, callOutRosterId, isAcknowledged, callOutDtUtc, notificationTime, notificationRemark, actRestStrDtUtc, location, actStartDtUtc, actionDtUtc.
- `roster_flight.flt_dt` is **varchar** (compare to `'YYYY-MM-DD'` strings); `sch_str_dt_utc`/`act_str_dt_utc` are timestamps (compare to dates).
- Cross-cutting: `createdDt→created_at`, `lastModified→updated_at`, `modifiedBy→updated_by`.

---

## File Structure

```
engine-server/F8/ro_input_builder/
  context.py          # MODIFY: add roster_window()
  sections/roster.py  # NEW: ROSTER_FLIGHT, ROSTER_GROUND, ROSTER
  registry.py         # MODIFY: add p6_registry()
  cli.py              # MODIFY: wire "p6"
engine-server/tests/
  test_ro_input_roster_sections.py  # NEW
  test_ro_input_reference_sections.py  # MODIFY: p6 CLI test
```

---

## Task 6.0: Roster window helper + RosterFlight

**Files:** Modify `context.py`; Create `engine-server/F8/ro_input_builder/sections/roster.py`; Create `engine-server/tests/test_ro_input_roster_sections.py`.

- [ ] **Step 1: Write the failing tests** — create `engine-server/tests/test_ro_input_roster_sections.py`:

```python
import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden, context
from F8.ro_input_builder.sections import roster

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
    text = registry.run_section(conn, spec, {"airline": "f8", "scenario": 6})
    return golden.parse_text(text)[spec.name]


def test_roster_flight_header_matches_golden(conn, gold):
    assert _emit(conn, roster.ROSTER_FLIGHT).columns == gold["RosterFlight"].columns


def test_roster_flight_scoped_to_scenario_crew_with_pairing(conn):
    ctx = {"airline": "f8", "scenario": 6}
    scen = {int(x) for x in context.scenario_crew_ids(conn, ctx)}
    sec = _emit(conn, roster.ROSTER_FLIGHT)
    ci = sec.columns.index("crewId")
    pi = sec.columns.index("pairingId")
    assert sec.rows
    assert all(int(r[ci]) in scen for r in sec.rows)
    assert all(r[pi] not in ("", "0") for r in sec.rows)   # flight rows have a pairing
```

- [ ] **Step 2: Run to verify failure** — `$PY -m pytest tests/test_ro_input_roster_sections.py -v` → FAIL (`module 'roster' not found`). Must fail, not skip.

- [ ] **Step 3: Add `roster_window` to `context.py`** (append)

```python
def roster_window(conn, ctx):
    """(lo_date, hi_date) for roster scoping: [str-9d, end+9d)."""
    sc = get_scenario(conn, ctx)
    return sc["start"] - timedelta(days=9), sc["end"] + timedelta(days=9)
```

- [ ] **Step 4: Create `engine-server/F8/ro_input_builder/sections/roster.py`** with `ROSTER_FLIGHT`

```python
"""Roster-layer SectionSpecs. All derive from roster_flight, scoped to the
scenario crew set + window. RosterFlight = pairing rows; RosterGround = ground
rows; Roster = reconstructed pairing-level via GROUP BY (crew_id, pairing_id)."""
from __future__ import annotations

from ..registry import SectionSpec, Col
from .. import registry as _reg
from .. import context

_PAIRING_START_SUBQ = "(SELECT sch_str_dt_utc FROM pairing WHERE id = roster_flight.pairing_id)"

_RF_COLS = [
    Col("id", "id"), Col("scenarioId", "scenario_id"), Col("pairingId", "pairing_id"),
    Col("dutyId", None), Col("rosterId", None), Col("fltId", "flt_id"),
    Col("fltDt", "flt_dt"), Col("division", "division"), Col("crewId", "crew_id"),
    Col("actingRank", "flight_acting_rank"), Col("activeRank", "active_rank"),
    Col("position", "position"), Col("assignment", "assignment"),
    Col("seqOrder", "seq_order"), Col("checkType", "check_type"),
    Col("tsFlag", "ts_flag"), Col("sendFlag", "send_flag"), Col("source", "source"),
    Col("createdDt", "created_at"), Col("createdBy", "created_by"),
    Col("resourceCode", "resource_code"), Col("role", "role"),
    Col("groupId", "group_id"), Col("tmProgramCourseId", "tm_program_course_id"),
    Col("parentTmProgramCourseId", "parent_tm_program_course_id"),
    Col("courseCode", "course_code"), Col("subRole", "sub_role"),
    Col("subGroupId", "sub_group_id"),
    Col("subTmProgramCourseId", "sub_tm_program_course_id"),
    Col("subParentTmProgramCourseId", "sub_parent_tm_program_id"),
    Col("subCourseCode", "sub_course_code"),
    Col("isExtraCourse", "is_extra_course", fmt="bool01"), Col("tagSet", "tag_set"),
    Col("pairingStartUtc", _PAIRING_START_SUBQ), Col("requestSource", "request_source"),
    Col("requestId", "request_id"), Col("isPublish", "is_publish"),
    Col("isAgreeWork", None), Col("exceptionCode", "exception_code"),
    Col("actionDtUtc", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _roster_flight(conn, ctx):
    ids = [int(x) for x in context.scenario_crew_ids(conn, ctx)]
    if not ids:
        return []
    lo, hi = context.roster_window(conn, ctx)
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_RF_COLS)} FROM roster_flight "
        f"WHERE scenario_id = 0 AND pairing_id IS NOT NULL AND is_deleted = 0 "
        f"AND crew_id = ANY(%(ids)s) "
        f"AND flt_dt >= %(lo)s AND flt_dt < %(hi)s ORDER BY id",
        {"ids": [str(i) for i in ids], "lo": lo.isoformat(), "hi": hi.isoformat()},
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_RF_COLS, raw)


ROSTER_FLIGHT = SectionSpec(name="RosterFlight", cols=_RF_COLS, custom=_roster_flight)
```

> `crew_id` is varchar — pass ids as strings. `flt_dt` is varchar — compare to ISO date strings. If a header test fails, align `_RF_COLS` to `grep -n "^------RosterFlight(" complete/F8/6_20260612_125629/ro_input.txt`. If a column raises UndefinedColumn, fix via `information_schema` (table `roster_flight`).

- [ ] **Step 5: Run to verify pass** — `$PY -m pytest tests/test_ro_input_roster_sections.py -v` → 2 passed.

- [ ] **Step 6: Commit**

```bash
git add F8/ro_input_builder/context.py F8/ro_input_builder/sections/roster.py tests/test_ro_input_roster_sections.py
git commit -m "feat(engine-server): RosterFlight section + roster window scope (P6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6.1: RosterGround

**Files:** Modify `engine-server/F8/ro_input_builder/sections/roster.py`; Modify `engine-server/tests/test_ro_input_roster_sections.py`.

- [ ] **Step 1: Append the failing tests**

```python
def test_roster_ground_header_matches_golden(conn, gold):
    assert _emit(conn, roster.ROSTER_GROUND).columns == gold["RosterGround"].columns


def test_roster_ground_scoped_to_scenario_crew(conn):
    ctx = {"airline": "f8", "scenario": 6}
    scen = {int(x) for x in context.scenario_crew_ids(conn, ctx)}
    sec = _emit(conn, roster.ROSTER_GROUND)
    ci = sec.columns.index("crewId")
    assert sec.rows and all(int(r[ci]) in scen for r in sec.rows)
```

- [ ] **Step 2: Run to verify failure** — `$PY -m pytest tests/test_ro_input_roster_sections.py -k ground -v` → FAIL (`ROSTER_GROUND` missing).

- [ ] **Step 3: Append to `engine-server/F8/ro_input_builder/sections/roster.py`**

```python
_RG_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"), Col("scenarioId", "scenario_id"),
    Col("assignmentGroup", "assignment_group"), Col("assignment", "assignment"),
    Col("location", "dep_arp"), Col("strDtUtc", "sch_str_dt_utc"),
    Col("endDtUtc", "sch_end_dt_utc"), Col("isLocked", None),
    Col("sendFlag", "send_flag"), Col("restEndDtUtc", None),
    Col("createdBy", "created_by"), Col("createdDt", "created_at"),
    Col("remarks", None), Col("isRequested", "is_requested", fmt="bool01"),
    Col("isSwapped", "is_swapped", fmt="bool01"), Col("source", "source"),
    Col("filiale", None), Col("division", "division"), Col("isVolunteer", None),
    Col("comments", "comments"), Col("label", "label"),
    Col("resourceCode", "resource_code"), Col("role", "role"),
    Col("groupId", "group_id"), Col("tmProgramCourseId", "tm_program_course_id"),
    Col("parentTmProgramCourseId", "parent_tm_program_course_id"),
    Col("courseCode", "course_code"), Col("subRole", "sub_role"),
    Col("subGroupId", "sub_group_id"),
    Col("subTmProgramCourseId", "sub_tm_program_course_id"),
    Col("subParentTmProgramCourseId", "sub_parent_tm_program_id"),
    Col("subCourseCode", "sub_course_code"),
    Col("isExtraCourse", "is_extra_course", fmt="bool01"),
    Col("requestSource", "request_source"), Col("requestId", "request_id"),
    Col("isPublish", "is_publish"), Col("tagSet", "tag_set"), Col("isPush", None),
    Col("transactionId", None), Col("notificationTime", None),
    Col("notificationRemark", None), Col("callOutRosterId", None),
    Col("isAcknowledged", None), Col("callOutDtUtc", None),
    Col("dpMin", "act_credited_minutes"), Col("isAgreeWork", None),
    Col("exceptionCode", "exception_code"), Col("autoLabel", None),
    Col("actionDtUtc", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _roster_ground(conn, ctx):
    ids = [int(x) for x in context.scenario_crew_ids(conn, ctx)]
    if not ids:
        return []
    lo, hi = context.roster_window(conn, ctx)
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_RG_COLS)} FROM roster_flight "
        f"WHERE scenario_id = 0 AND pairing_id IS NULL AND is_deleted = 0 "
        f"AND crew_id = ANY(%(ids)s) "
        f"AND sch_str_dt_utc >= %(lo)s AND sch_str_dt_utc < %(hi)s ORDER BY id",
        {"ids": [str(i) for i in ids], "lo": lo, "hi": hi},
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_RG_COLS, raw)


ROSTER_GROUND = SectionSpec(name="RosterGround", cols=_RG_COLS, custom=_roster_ground)
```

> If the header test fails, align to `grep -n "^------RosterGround(" complete/F8/6_20260612_125629/ro_input.txt`. If `act_credited_minutes`/`dep_arp` raise UndefinedColumn, check `information_schema`.

- [ ] **Step 4: Run to verify pass** — `$PY -m pytest tests/test_ro_input_roster_sections.py -v` → 4 passed.

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/sections/roster.py tests/test_ro_input_roster_sections.py
git commit -m "feat(engine-server): RosterGround section (ground tasks from roster_flight) (P6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6.2: Roster (reconstructed pairing-level)

**Files:** Modify `engine-server/F8/ro_input_builder/sections/roster.py`; Modify `engine-server/tests/test_ro_input_roster_sections.py`.

- [ ] **Step 1: Append the failing tests**

```python
def test_roster_header_matches_golden(conn, gold):
    assert _emit(conn, roster.ROSTER).columns == gold["Roster"].columns


def test_roster_one_row_per_crew_pairing(conn):
    sec = _emit(conn, roster.ROSTER)
    ci = sec.columns.index("crewId")
    pi = sec.columns.index("pairingId")
    keys = [(r[ci], r[pi]) for r in sec.rows]
    assert sec.rows and len(keys) == len(set(keys))


def test_roster_act_start_le_act_end(conn):
    sec = _emit(conn, roster.ROSTER)
    si = sec.columns.index("actStrDtUtc")
    ei = sec.columns.index("actEndDtUtc")
    pairs = [(r[si], r[ei]) for r in sec.rows if r[si] and r[ei]]
    assert pairs and all(s <= e for s, e in pairs)   # ISO strings compare lexically
```

- [ ] **Step 2: Run to verify failure** — `$PY -m pytest tests/test_ro_input_roster_sections.py -k "roster_header or crew_pairing or act_start" -v` → FAIL (`ROSTER` missing).

- [ ] **Step 3: Append to `engine-server/F8/ro_input_builder/sections/roster.py`**

```python
# Reconstructed Roster: group roster_flight by (crew_id, pairing_id). Group keys
# (crew_id, pairing_id) are bare; everything else is an aggregate.
_ROSTER_COLS = [
    Col("id", "MIN(id)"), Col("scenarioId", "MIN(scenario_id)"), Col("ver", "MIN(ver)"),
    Col("crewId", "crew_id"), Col("label", "MIN(label)"), Col("pairingId", "pairing_id"),
    Col("assignmentGroup", "MIN(assignment_group)"), Col("assignment", "MIN(assignment)"),
    Col("actingRank", "MIN(flight_acting_rank)"), Col("position", "MIN(position)"),
    Col("role", "MIN(role)"), Col("subRole", "MIN(sub_role)"), Col("source", "MIN(source)"),
    Col("isRequested", "MIN(is_requested::int)", fmt="bool01"),
    Col("isDeleted", "MIN(is_deleted::int)", fmt="bool01"),
    Col("isSwapped", "MIN(is_swapped::int)", fmt="bool01"),
    Col("preference", "MIN(preference)"), Col("comments", "MIN(comments)"),
    Col("score", "MIN(score)"), Col("createdBy", "MIN(created_by)"),
    Col("createdDt", "MIN(created_at)"), Col("liveId", None),
    Col("callOutRosterId", None), Col("isAcknowledged", None), Col("callOutDtUtc", None),
    Col("notificationTime", None), Col("notificationRemark", None),
    Col("actStrDtUtc", "MIN(act_str_dt_utc)"), Col("actEndDtUtc", "MAX(act_end_dt_utc)"),
    Col("actRestStrDtUtc", None), Col("location", None), Col("actStartDtUtc", None),
    Col("actionDtUtc", None), Col("lastModified", "MAX(updated_at)"),
    Col("modifiedBy", "MIN(updated_by)"),
]


def _roster(conn, ctx):
    ids = [int(x) for x in context.scenario_crew_ids(conn, ctx)]
    if not ids:
        return []
    lo, hi = context.roster_window(conn, ctx)
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_ROSTER_COLS)} FROM roster_flight "
        f"WHERE scenario_id = 0 AND pairing_id IS NOT NULL AND is_deleted = 0 "
        f"AND crew_id = ANY(%(ids)s) "
        f"AND act_str_dt_utc >= %(lo)s AND act_str_dt_utc < %(hi)s "
        f"GROUP BY crew_id, pairing_id ORDER BY MIN(id)",
        {"ids": [str(i) for i in ids], "lo": lo, "hi": hi},
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_ROSTER_COLS, raw)


ROSTER = SectionSpec(name="Roster", cols=_ROSTER_COLS, custom=_roster)
```

> `is_*::int` casts smallint to int so `MIN()` + `bool01` work cleanly. If the header test fails, align `_ROSTER_COLS` to `grep -n "^------Roster(" complete/F8/6_20260612_125629/ro_input.txt` (the plain `Roster`, not `RosterFlight`/`RosterGround`/`RosterPeriod`). If `ver`/`score`/`preference` raise UndefinedColumn, check `information_schema` and set to None.

- [ ] **Step 4: Run to verify pass** — `$PY -m pytest tests/test_ro_input_roster_sections.py -v` → 7 passed.

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/sections/roster.py tests/test_ro_input_roster_sections.py
git commit -m "feat(engine-server): Roster section reconstructed from roster_flight groups (P6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6.3: Register P6 + version bump

**Files:** Modify `registry.py`, `cli.py`, `tests/test_ro_input_reference_sections.py`, `gantt/src/version.ts`.

- [ ] **Step 1: Append the failing CLI test** to `engine-server/tests/test_ro_input_reference_sections.py`:

```python
def test_cli_build_p6_emits_roster_sections(conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p6")
    text = out.read_text()
    for marker in ["------Roster(", "------RosterFlight(", "------RosterGround(",
                   "------Pairing(", "------Flight("]:
        assert marker in text
```

- [ ] **Step 2: Run to verify failure** — `$PY -m pytest tests/test_ro_input_reference_sections.py -k p6 -v` → FAIL (KeyError 'p6').

- [ ] **Step 3: Add `p6_registry()` to `registry.py`** (append)

```python
def p6_registry() -> list[SectionSpec]:
    """P5 sections plus the roster layer. Order provisional (P8 fixes it)."""
    from .sections import roster as ro
    return p5_registry() + [ro.ROSTER_FLIGHT, ro.ROSTER_GROUND, ro.ROSTER]
```

- [ ] **Step 4: Wire `"p6"` into `cli.py`** — extend the registry map:

```python
    specs = {"p1": registry.p1_registry, "p2": registry.p2_registry,
             "p3": registry.p3_registry, "p4": registry.p4_registry,
             "p5": registry.p5_registry, "p6": registry.p6_registry}[registry_name]()
```

- [ ] **Step 5: Run to verify pass + smoke test**

```bash
$PY -m pytest tests/test_ro_input_reference_sections.py -v
$PY -m F8.ro_input_builder --airline f8 --scenario 6 --out /tmp/p6.txt --registry p6
grep -c '^------' /tmp/p6.txt                      # expect 54 (51 P5 + 3)
grep -E '^------(Roster|RosterFlight|RosterGround)\([0-9]+\)' /tmp/p6.txt
```
Expected: tests pass; 54 sections; roster sections with live counts (NOT golden — reseed).

- [ ] **Step 6: Bump `BACKEND_VERSION`** in `gantt/src/version.ts` (98 → 99).

- [ ] **Step 7: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add engine-server/F8/ro_input_builder/registry.py engine-server/F8/ro_input_builder/cli.py engine-server/tests/test_ro_input_reference_sections.py gantt/src/version.ts
git commit -m "feat(engine-server): P6 registry assembly (roster) + BACKEND_VERSION 99

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria for P6

- `$PY -m pytest tests/test_ro_input_roster_sections.py tests/test_ro_input_reference_sections.py -v` → all pass.
- All 3 roster headers match golden; rows scoped to the 26 scenario crew; Roster is one-per-crew×pairing with `actStr ≤ actEnd`; `--registry p6` emits 54 sections.

## Known limitations (per §No-Illusion)

- DB reseed → counts can't match golden (structural validation only). P8 optimizer run is the functional gate.
- `Roster` is reconstructed (no roster table); per-group columns use `MIN()` assuming uniformity within a crew×pairing (verified true in practice except `label`, which legitimately varies per segment — `MIN(label)` picks one).
- Several roster columns have no DB source (emit empty) — listed above. The window buffer (±9d) is a P8 tuning point.

## Self-review

- Spec coverage: RosterFlight, RosterGround, Roster (spec §5 "Roster") ✔. Roster reconstruction + ground/flight split resolved ✔.
- Type consistency: `scenario_crew_ids`/`roster_window`/`select_list`/`apply_formats`/`run_section`/`p5_registry`/`p6_registry` consistent ✔.
- No placeholders: full Col lists, concrete reconstruction ✔.

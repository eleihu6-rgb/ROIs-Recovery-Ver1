# RO Input DB Generation — P7 (Manday + Scenario Meta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Emit the computed/meta sections — `CrewMandayFd`, `CrewMonthManday`, `Workset`, `Scenario`, `FatigueResult` — from PostgreSQL. (`CalculationManday` is already served via the P1 passthrough.)

**Architecture:** `CrewMandayFd`/`CrewMonthManday` are crew-day/month accounting tables scoped to the scenario crew + window (custom builders). `Workset` ← `workset WHERE id = scenario.workset_id`. `Scenario` ← `scenario WHERE id = <scenario>` (best-effort; ~38 legacy cols are unmapped, now in `filter_params`). `FatigueResult` ← `fatigue_result` (empty → 0 rows).

**Tech Stack:** Python 3.12, psycopg2, pytest. Builds on `engine-server/F8/ro_input_builder/` (P0–P6, merged).

**Spec:** `docs/superpowers/specs/2026-06-15-ro-input-db-generation-design.md`
**Golden:** `engine-server/complete/F8/6_20260612_125629/ro_input.txt`

**Run from `engine-server/`.** `PY=/home/yuan.z/rois/rois-ai/ro-engine/.venv/bin/python`. **Export before every DB test (else skip — must PASS):**
```bash
export LEGACY_RO_DB_URL='postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8'
```

---

## Key facts (verified)

- `CrewMandayFd` ← `crew_manday_fd_daily`; scope `scenario_id=0 AND crew_id = ANY(scenario_crew_ids) AND crew_base_dt` in `[str−9d, end+9d)`. Only `radiationDose` unmapped. The `is_leave`/`is_day_off` cols are **integers** (no bool01). Live ≈ thousands (golden 1241) — reseed drift, structural validation.
- `CrewMonthManday` ← `crew_manday_fd_monthly`; `month`→`year_month` (char(7)); scope `scenario_id=0 AND crew_id = ANY(...) AND year_month` between the window's months. All 6 cols map.
- `Workset` ← `workset WHERE id = scenario.workset_id` (1 row). All 10 cols map; `createdDt→created_at`.
- `Scenario` ← `scenario WHERE id = <scenario>` (1 row). Best-effort: `ruleSetId→rule_group_code` (type change), `jsonLive→filter_params::text`, `type→file_type`; **38 cols unmapped** (filter id-lists → `filter_params`). bool01: `isPublic`, `isFavorite`, `leadInLive`. (No `id` column in the Scenario header.)
- `FatigueResult` ← `fatigue_result` (no scenario col; table empty → 0 rows). All 16 cols map.
- Cross-cutting: `id→id`, `lastModified→updated_at`, `modifiedBy→updated_by`, `createdDt→created_at`.

---

## File Structure

```
engine-server/F8/ro_input_builder/
  sections/manday.py    # NEW: CREW_MANDAY_FD, CREW_MONTH_MANDAY, FATIGUE_RESULT
  sections/meta.py      # NEW: WORKSET, SCENARIO
  registry.py           # MODIFY: add p7_registry()
  cli.py                # MODIFY: wire "p7"
engine-server/tests/
  test_ro_input_manday_meta_sections.py  # NEW
  test_ro_input_reference_sections.py    # MODIFY: p7 CLI test
```

---

## Task 7.0: CrewMandayFd + CrewMonthManday + FatigueResult

**Files:** Create `engine-server/F8/ro_input_builder/sections/manday.py`; Create `engine-server/tests/test_ro_input_manday_meta_sections.py`.

- [ ] **Step 1: Write the failing tests** — create `engine-server/tests/test_ro_input_manday_meta_sections.py`:

```python
import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden, context
from F8.ro_input_builder.sections import manday

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


def test_crew_manday_fd_header_matches_golden(conn, gold):
    assert _emit(conn, manday.CREW_MANDAY_FD).columns == gold["CrewMandayFd"].columns


def test_crew_manday_fd_scoped_to_scenario_crew(conn):
    ctx = {"airline": "f8", "scenario": 6}
    scen = {int(x) for x in context.scenario_crew_ids(conn, ctx)}
    sec = _emit(conn, manday.CREW_MANDAY_FD)
    ci = sec.columns.index("crewId")
    assert sec.rows and all(int(r[ci]) in scen for r in sec.rows)


def test_crew_month_manday_header_matches_golden(conn, gold):
    assert _emit(conn, manday.CREW_MONTH_MANDAY).columns == gold["CrewMonthManday"].columns


def test_fatigue_result_header_matches_golden(conn, gold):
    assert _emit(conn, manday.FATIGUE_RESULT).columns == gold["FatigueResult"].columns
```

- [ ] **Step 2: Run to verify failure** — `$PY -m pytest tests/test_ro_input_manday_meta_sections.py -v` → FAIL (`module 'manday' not found`). Must fail, not skip.

- [ ] **Step 3: Create `engine-server/F8/ro_input_builder/sections/manday.py`**

```python
"""Manday accounting + FatigueResult sections."""
from __future__ import annotations

from ..registry import SectionSpec, Col
from .. import registry as _reg
from .. import context

_MANDAY_FD_COLS = [
    Col("scenarioId", "scenario_id"), Col("crewId", "crew_id"),
    Col("crewBaseDt", "crew_base_dt"), Col("ft", "ft"), Col("augumentFt", "augument_ft"),
    Col("doubleFt", "double_ft"), Col("blh", "blh"), Col("augumentBlh", "augument_blh"),
    Col("doubleBlh", "double_blh"), Col("fdp", "fdp"), Col("dp", "dp"),
    Col("nightDp", "night_dp"), Col("travel", "travel"), Col("credit", "credit"),
    Col("fatigue", "fatigue"), Col("isLeave", "is_leave"), Col("isDayOff", "is_day_off"),
    Col("standby", "standby"), Col("actTakeOffs", "act_take_offs"),
    Col("actLandings", "act_landings"), Col("ground", "ground"),
    Col("actingRank", "acting_rank"), Col("fleet", "fleet"), Col("id", "id"),
    Col("perDiem", "per_diem"), Col("normalWp", "normal_wp"), Col("extendWp", "extend_wp"),
    Col("csb", "csb"), Col("hsb", "hsb"), Col("asb", "asb"), Col("isAl", "is_al"),
    Col("updowns", "updowns"), Col("cat2Updowns", "cat2_updowns"), Col("expBlh", "exp_blh"),
    Col("quarantine", "quarantine"), Col("custData1", "cust_data1"),
    Col("custData2", "cust_data2"), Col("highPlateau", "high_plateau"),
    Col("operatingFleets", "operating_fleets"), Col("operatingAirports", "operating_airports"),
    Col("takeoff", "takeoff"), Col("landing", "landing"), Col("isPosition", "is_position"),
    Col("workingHour", "working_hour"), Col("fleetTakeoff", "fleet_takeoff"),
    Col("fleetLanding", "fleet_landing"), Col("nightTakeoff", "night_takeoff"),
    Col("nightLanding", "night_landing"), Col("attributes", "attributes"),
    Col("intBlh", "int_blh"), Col("fltNum", "flt_num"), Col("radiationDose", None),
    Col("crossTzDutyCount", "cross_tz_duty_count"), Col("layoverTimes", "layover_times"),
    Col("layoverDuration", "layover_duration"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_MONTH_MANDAY_COLS = [
    Col("crewId", "crew_id"), Col("month", "year_month"), Col("blh", "blh"),
    Col("fdp", "fdp"), Col("dp", "dp"), Col("highPlateau", "high_plateau"),
]

_FATIGUE_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"), Col("dutyStart", "duty_start"),
    Col("dutyEnd", "duty_end"), Col("fatigueIndex", "fatigue_index"),
    Col("rosterId", "roster_id"), Col("dutyId", "duty_id"), Col("maxSp", "max_sp"),
    Col("maxTod", "max_tod"), Col("risk", "risk"),
    Col("firstSleepStart", "first_sleep_start"), Col("firstSleepEnd", "first_sleep_end"),
    Col("secondSleepStart", "second_sleep_start"), Col("secondSleepEnd", "second_sleep_end"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _crew_manday_fd(conn, ctx):
    ids = [str(int(x)) for x in context.scenario_crew_ids(conn, ctx)]
    if not ids:
        return []
    lo, hi = context.roster_window(conn, ctx)
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_MANDAY_FD_COLS)} FROM crew_manday_fd_daily "
        f"WHERE scenario_id = 0 AND crew_id = ANY(%(ids)s) "
        f"AND crew_base_dt >= %(lo)s AND crew_base_dt < %(hi)s ORDER BY crew_id, crew_base_dt",
        {"ids": ids, "lo": lo, "hi": hi},
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_MANDAY_FD_COLS, raw)


def _crew_month_manday(conn, ctx):
    ids = [str(int(x)) for x in context.scenario_crew_ids(conn, ctx)]
    if not ids:
        return []
    lo, hi = context.roster_window(conn, ctx)
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_MONTH_MANDAY_COLS)} FROM crew_manday_fd_monthly "
        f"WHERE scenario_id = 0 AND crew_id = ANY(%(ids)s) "
        f"AND year_month >= %(lo)s AND year_month <= %(hi)s ORDER BY crew_id, year_month",
        {"ids": ids, "lo": lo.strftime("%Y-%m"), "hi": hi.strftime("%Y-%m")},
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_MONTH_MANDAY_COLS, raw)


CREW_MANDAY_FD = SectionSpec(name="CrewMandayFd", cols=_MANDAY_FD_COLS, custom=_crew_manday_fd)
CREW_MONTH_MANDAY = SectionSpec(
    name="CrewMonthManday", cols=_MONTH_MANDAY_COLS, custom=_crew_month_manday,
)
FATIGUE_RESULT = SectionSpec(
    name="FatigueResult", table="fatigue_result", cols=_FATIGUE_COLS, order_by="id",
)
```

> If a header test fails, align to `grep -n "^------CrewMandayFd(" / "^------CrewMonthManday(" / "^------FatigueResult(" complete/F8/6_20260612_125629/ro_input.txt`. If a DB column raises UndefinedColumn, fix via `information_schema` (tables `crew_manday_fd_daily`, `crew_manday_fd_monthly`, `fatigue_result`).

- [ ] **Step 4: Run to verify pass** — `$PY -m pytest tests/test_ro_input_manday_meta_sections.py -v` → 4 passed.

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/sections/manday.py tests/test_ro_input_manday_meta_sections.py
git commit -m "feat(engine-server): CrewMandayFd + CrewMonthManday + FatigueResult sections (P7)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7.1: Workset + Scenario

**Files:** Create `engine-server/F8/ro_input_builder/sections/meta.py`; Modify `engine-server/tests/test_ro_input_manday_meta_sections.py`.

- [ ] **Step 1: Append the failing tests**

```python
from F8.ro_input_builder.sections import meta


def test_workset_header_matches_golden(conn, gold):
    assert _emit(conn, meta.WORKSET).columns == gold["Workset"].columns


def test_workset_one_row(conn):
    sec = _emit(conn, meta.WORKSET)
    assert len(sec.rows) == 1                    # the scenario's workset


def test_scenario_header_matches_golden(conn, gold):
    assert _emit(conn, meta.SCENARIO).columns == gold["Scenario"].columns


def test_scenario_one_row_with_window(conn):
    sec = _emit(conn, meta.SCENARIO)
    assert len(sec.rows) == 1
    si = sec.columns.index("strDtLoc")
    assert sec.rows[0][si].startswith("2026-06-01")   # scenario 6 start
```

- [ ] **Step 2: Run to verify failure** — `$PY -m pytest tests/test_ro_input_manday_meta_sections.py -k "workset or scenario" -v` → FAIL (`module 'meta' not found`).

- [ ] **Step 3: Create `engine-server/F8/ro_input_builder/sections/meta.py`**

```python
"""Workset + Scenario meta sections (1 row each)."""
from __future__ import annotations

from ..registry import SectionSpec, Col
from .. import registry as _reg

_WORKSET_COLS = [
    Col("id", "id"), Col("name", "name"), Col("type", "type"),
    Col("category", "category"), Col("division", "division"),
    Col("createdBy", "created_by"), Col("createdDt", "created_at"),
    Col("filiale", "filiale"), Col("lastModified", "updated_at"),
    Col("modifiedBy", "updated_by"),
]

# Scenario header has NO `id` column; starts at worksetId.
_SCENARIO_COLS = [
    Col("worksetId", "workset_id"), Col("version", "version"), Col("status", "status"),
    Col("processId", "process_id"), Col("strDtLoc", "str_dt_loc"),
    Col("endDtLoc", "end_dt_loc"), Col("pairingBaseIds", None),
    Col("crewMainBaseIds", None), Col("pairingRankIds", None), Col("actingRankId", None),
    Col("pairingFleetIds", None), Col("runModeIds", None), Col("fltSchId", None),
    Col("ferryId", None), Col("ruleSetId", "rule_group_code"), Col("cqfSetId", "cqfset_id"),
    Col("assignmentGroupIds", None), Col("pairingScenarioId", "pairing_scenario_id"),
    Col("paIds", None), Col("qualificationIds", None), Col("languageIds", None),
    Col("isPublic", "is_public", fmt="bool01"), Col("isFavorite", "is_favorite", fmt="bool01"),
    Col("action", "action"), Col("filterCrewCountry", None), Col("filterCrewQual", None),
    Col("filterCrewPosition", None), Col("filterCrewTeam", None),
    Col("leadInLive", "leadin_live", fmt="bool01"), Col("crewAssistantBaseIds", None),
    Col("crewRankIds", None), Col("crewFleetIds", None), Col("crewCountryIds", None),
    Col("crewSex", None), Col("crewAge", None), Col("crewTeamIds", None),
    Col("crewPositionIds", None), Col("crewBaseRelation", None), Col("crewFirstQualIds", None),
    Col("crewSecondQualIds", None), Col("crewThirdQualIds", None), Col("crewQualRelation", None),
    Col("tagIds", None), Col("rankCross", "rank_cross"), Col("comments", "comments"),
    Col("optimizedCount", "optimized_count"), Col("loadType", None), Col("division", None),
    Col("name", "name"), Col("category", None), Col("type", "file_type"),
    Col("inParent", None), Col("live", None), Col("jsonLive", "filter_params::text"),
    Col("isSnapShot", None), Col("isMapping", None), Col("isMappingRefresh", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _workset(conn, ctx):
    cur = conn.cursor()
    cur.execute("SELECT workset_id FROM scenario WHERE id = %s", (ctx["scenario"],))
    row = cur.fetchone()
    if not row or row[0] is None:
        cur.close()
        return []
    cur.execute(
        f"SELECT {_reg.select_list(_WORKSET_COLS)} FROM workset WHERE id = %s ORDER BY id",
        (row[0],),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_WORKSET_COLS, raw)


def _scenario(conn, ctx):
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_SCENARIO_COLS)} FROM scenario WHERE id = %s",
        (ctx["scenario"],),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_SCENARIO_COLS, raw)


WORKSET = SectionSpec(name="Workset", cols=_WORKSET_COLS, custom=_workset)
SCENARIO = SectionSpec(name="Scenario", cols=_SCENARIO_COLS, custom=_scenario)
```

> If a header test fails, align to `grep -n "^------Workset(" / "^------Scenario(" complete/F8/6_20260612_125629/ro_input.txt`. If `rule_group_code`/`file_type`/`leadin_live`/`pairing_scenario_id` raise UndefinedColumn, check `information_schema` (table `scenario`) and fix or set None. `strDtLoc` should render `2026-06-01...`; if `str_dt_loc` is a date it prints `2026-06-01`, if timestamp `2026-06-01T00:00:00` — the test uses `startswith("2026-06-01")` so either is fine.

- [ ] **Step 4: Run to verify pass** — `$PY -m pytest tests/test_ro_input_manday_meta_sections.py -v` → 8 passed.

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/sections/meta.py tests/test_ro_input_manday_meta_sections.py
git commit -m "feat(engine-server): Workset + Scenario meta sections (P7)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7.2: Register P7 + version bump

**Files:** Modify `registry.py`, `cli.py`, `tests/test_ro_input_reference_sections.py`, `gantt/src/version.ts`.

- [ ] **Step 1: Append the failing CLI test** to `engine-server/tests/test_ro_input_reference_sections.py`:

```python
def test_cli_build_p7_emits_manday_meta_sections(conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p7")
    text = out.read_text()
    for marker in ["------CrewMandayFd(", "------CrewMonthManday(", "------Workset(",
                   "------Scenario(", "------FatigueResult(", "------Roster("]:
        assert marker in text
```

- [ ] **Step 2: Run to verify failure** — `$PY -m pytest tests/test_ro_input_reference_sections.py -k p7 -v` → FAIL (KeyError 'p7').

- [ ] **Step 3: Add `p7_registry()` to `registry.py`** (append)

```python
def p7_registry() -> list[SectionSpec]:
    """P6 sections plus manday + scenario meta. Order provisional (P8 fixes it)."""
    from .sections import manday as md
    from .sections import meta as mt
    return p6_registry() + [
        md.CREW_MANDAY_FD, md.CREW_MONTH_MANDAY, md.FATIGUE_RESULT,
        mt.WORKSET, mt.SCENARIO,
    ]
```

- [ ] **Step 4: Wire `"p7"` into `cli.py`** — extend the registry map:

```python
    specs = {"p1": registry.p1_registry, "p2": registry.p2_registry,
             "p3": registry.p3_registry, "p4": registry.p4_registry,
             "p5": registry.p5_registry, "p6": registry.p6_registry,
             "p7": registry.p7_registry}[registry_name]()
```

- [ ] **Step 5: Run to verify pass + smoke test**

```bash
$PY -m pytest tests/test_ro_input_reference_sections.py -v
$PY -m F8.ro_input_builder --airline f8 --scenario 6 --out /tmp/p7.txt --registry p7
grep -c '^------' /tmp/p7.txt                      # expect 59 (54 P6 + 5)
grep -E '^------(CrewMandayFd|CrewMonthManday|Workset|Scenario|FatigueResult)\([0-9]+\)' /tmp/p7.txt
```
Expected: tests pass; 59 sections; `Workset(1)`, `Scenario(1)`, `FatigueResult(0)`, CrewManday* live counts.

- [ ] **Step 6: Bump `BACKEND_VERSION`** in `gantt/src/version.ts` (99 → 100).

- [ ] **Step 7: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add engine-server/F8/ro_input_builder/registry.py engine-server/F8/ro_input_builder/cli.py engine-server/tests/test_ro_input_reference_sections.py gantt/src/version.ts
git commit -m "feat(engine-server): P7 registry assembly (manday + meta) + BACKEND_VERSION 100

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria for P7

- `$PY -m pytest tests/test_ro_input_manday_meta_sections.py tests/test_ro_input_reference_sections.py -v` → all pass.
- All 5 headers match golden; CrewManday* scoped to the 26 scenario crew; Workset/Scenario one row each; FatigueResult 0 rows; `--registry p7` emits 59 sections.
- **After P7 the builder covers all ~60 sections** — P8 then handles golden-order assembly + the toggle + the optimizer run.

## Known limitations (per §No-Illusion)

- DB reseed → CrewManday counts can't match golden (structural validation).
- `Scenario` is best-effort: ~38 legacy cols (filter id-lists) emit empty (now in `filter_params`); `ruleSetId→rule_group_code` is a representation change. Whether the optimizer needs those fields is settled by the P8 run.
- `FatigueResult` table is empty (matches golden's 0).

## Self-review

- Spec coverage: CrewMandayFd, CrewMonthManday, FatigueResult, Workset, Scenario (spec §5 "Computed/aggregate") ✔.
- Type consistency: `scenario_crew_ids`/`roster_window`/`select_list`/`apply_formats`/`run_section`/`p6_registry`/`p7_registry` consistent ✔.
- No placeholders: full Col lists ✔.

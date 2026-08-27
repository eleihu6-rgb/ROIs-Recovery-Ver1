# RO Input DB Generation — P2 (Crew Domain) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Emit the 8 crew-domain sections (`Crew`, `CrewRank`, `CrewBase`, `CrewFleet`, `CrewQualification`, `CrewStatus`, `CrewCertificate` — each in scenario + `(COF)` variant — plus `CrewOnFlight`) from PostgreSQL, scoped by the scenario's `filter_params`, reusing the P0 framework.

**Architecture:** A `context.py` loads the scenario row + `filter_params` (JSON) once and computes two disjoint crew-id sets: the **scenario set** (crew matching `filter_params.crew` over base/fleet/division within the scenario date window — exactly reproduces the golden) and the **COF set** (distinct crew on the scenario flight pool, minus the scenario set — structurally correct but time-dependent on live data). Crew sections are `SectionSpec`s with `custom` callables that filter each table by the relevant crew-id set.

**Tech Stack:** Python 3.12, psycopg2, pytest. Builds on `engine-server/F8/ro_input_builder/` (P0+P1, already merged to main).

**Spec:** `docs/superpowers/specs/2026-06-15-ro-input-db-generation-design.md`
**Golden:** `engine-server/complete/F8/6_20260612_125629/ro_input.txt`

**Run from `engine-server/`.** `PY=/home/yuan.z/rois/rois-ai/ro-engine/.venv/bin/python`. **Export before every DB test (else tests skip — they MUST pass, not skip):**
```bash
export LEGACY_RO_DB_URL='postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8'
```

---

## Key facts (verified against the live f8 DB)

- Scenario 6's filter is in `scenario.filter_params` (JSON), not columns:
  `{"crew":{"bases":["YEG"],"fleets":["7M8","737"],"status":"ACTIVE","division":"P"}, "pairing":{...}, "ruleGroupCode":"ccar121_ro"}`. Window: `scenario.str_dt_loc=2026-06-01`, `end_dt_loc=2026-06-30`.
- **Scenario crew set (golden `Crew(26)`)** is reproduced EXACTLY by: crew with `division='P'`, having a `crew_base` in `bases` and a `crew_fleet` whose `fleet_grp ∈ fleets OR IS NULL`, both effective-overlapping the window. (Verified: exact 26 IDs, no rank filter needed — `division='P'` covers it.)
- **COF set (golden `Crew(124)(COF)`)** = distinct `roster_flight.crew_id` on the scenario flight pool, **minus** the scenario set. The two sets are **disjoint**. This set is **NOT byte-reproducible** vs the golden because live `roster_flight` has drifted since the 2026-06-12 snapshot (today recovers ~93/124). The rule is correct; exact membership is validated only by the P8 end-to-end optimizer run. **Therefore P2 tests assert structure (non-empty, disjoint, members∈flight-pool), NOT golden equality, for COF.**
- `crew_id` is `varchar` in all crew/roster tables — keep id-sets as the stored string values; filter sub-tables with `WHERE crew_id = ANY(%s)`.
- Cross-cutting: `id→id`, `lastModified→updated_at`, `modifiedBy→updated_by`. Clearly-boolean smallints use `fmt='bool01'`; ambiguous status fields map plain (verify values against golden during impl).

---

## File Structure

```
engine-server/F8/ro_input_builder/
  context.py            # NEW: scenario loader + crew-id set computation
  sections/crew.py      # NEW: 8 crew-domain SectionSpecs (+ scenario/COF variants)
  registry.py           # MODIFY: add p2_registry()
engine-server/tests/
  test_ro_input_context.py    # NEW: crew-id set tests
  test_ro_input_crew_sections.py  # NEW: crew section tests
```

---

## Task 2.0: Scenario context + crew-id sets

**Files:** Create `engine-server/F8/ro_input_builder/context.py`; Create `engine-server/tests/test_ro_input_context.py`.

- [ ] **Step 1: Write the failing test** — create `engine-server/tests/test_ro_input_context.py`:

```python
import re
import pytest
import psycopg2
from F8.ro_input_builder import db, context

GOLDEN = "complete/F8/6_20260612_125629/ro_input.txt"


def _golden_crew_ids(variant):
    """Parse the golden Crew section crewId list for the given variant (None or 'COF')."""
    name_key = ("Crew", variant)
    ids, cur, idx = [], None, None
    for line in open(GOLDEN, encoding="utf-8").read().splitlines():
        m = re.match(r"------(\w+)\((\d+)\)(?:\((\w+)\))?:(.*)", line)
        if m:
            cur = (m.group(1), m.group(3))
            cols = m.group(4).split(",")
            idx = cols.index("crewId") if "crewId" in cols else None
        elif cur == name_key and line:
            ids.append(line.split("^")[idx])
    return {int(x) for x in ids}


@pytest.fixture(scope="module")
def conn():
    try:
        c = db.connect("f8")
    except psycopg2.OperationalError as e:
        pytest.skip(f"f8 DB unavailable: {e}")
    yield c
    c.close()


def test_scenario_crew_ids_match_golden_exactly(conn):
    ctx = {"airline": "f8", "scenario": 6}
    got = {int(x) for x in context.scenario_crew_ids(conn, ctx)}
    assert got == _golden_crew_ids(None)        # exact 26-set reproduction


def test_cof_set_is_nonempty_and_disjoint_from_scenario(conn):
    ctx = {"airline": "f8", "scenario": 6}
    scen = {int(x) for x in context.scenario_crew_ids(conn, ctx)}
    cof = {int(x) for x in context.cof_crew_ids(conn, ctx)}
    assert cof, "COF set must be non-empty"
    assert scen.isdisjoint(cof), "scenario and COF sets must be disjoint"


def test_context_caches_scenario(conn):
    ctx = {"airline": "f8", "scenario": 6}
    a = context.get_scenario(conn, ctx)
    b = context.get_scenario(conn, ctx)
    assert a is b                                # cached, same object
    assert a["filter"]["crew"]["bases"] == ["YEG"]
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_context.py -v`
Expected: FAIL (`module 'context' has no attribute ...`). MUST fail, not skip — if skipped, export `LEGACY_RO_DB_URL`.

- [ ] **Step 3: Implement `engine-server/F8/ro_input_builder/context.py`**

```python
"""Scenario filter loading + crew-id set computation for ro_input generation.

The scenario's crew/flight scoping comes from `scenario.filter_params` (JSON) and
the `str_dt_loc`/`end_dt_loc` window. Computed sets are cached on the ctx dict.
"""
from __future__ import annotations

import json
from datetime import timedelta

# Flight-pool buffer around the scenario window for the COF set (lead-in / lead-out).
_COF_LEAD_DAYS = 14
_COF_TAIL_DAYS = 9


def _cache(ctx) -> dict:
    return ctx.setdefault("_cache", {})


def get_scenario(conn, ctx) -> dict:
    c = _cache(ctx)
    if "scenario" in c:
        return c["scenario"]
    sid = ctx["scenario"]
    cur = conn.cursor()
    cur.execute(
        "SELECT id, str_dt_loc, end_dt_loc, filter_params FROM scenario WHERE id = %s",
        (sid,),
    )
    row = cur.fetchone()
    cur.close()
    if row is None:
        raise ValueError(f"scenario {sid} not found")
    _id, start, end, fp = row
    if isinstance(fp, str):
        fp = json.loads(fp)
    sc = {"id": _id, "start": start, "end": end, "filter": fp or {}}
    c["scenario"] = sc
    return sc


def scenario_crew_ids(conn, ctx) -> list[str]:
    """Crew matching filter_params.crew over base/fleet/division within the window.
    Returns the stored varchar crew_id values, ordered numerically."""
    c = _cache(ctx)
    if "scenario_crew_ids" in c:
        return c["scenario_crew_ids"]
    sc = get_scenario(conn, ctx)
    cf = sc["filter"].get("crew", {})
    bases = cf.get("bases") or []
    fleets = cf.get("fleets") or []
    division = cf.get("division")
    cur = conn.cursor()
    cur.execute(
        """
        SELECT c.crew_id FROM crew c
        WHERE (%(division)s IS NULL OR c.division = %(division)s)
          AND EXISTS (SELECT 1 FROM crew_base cb WHERE cb.crew_id = c.crew_id
                      AND cb.base = ANY(%(bases)s)
                      AND (cb.eff_dt IS NULL OR cb.eff_dt <= %(end)s)
                      AND (cb.exp_dt IS NULL OR cb.exp_dt >= %(start)s))
          AND EXISTS (SELECT 1 FROM crew_fleet cf WHERE cf.crew_id = c.crew_id
                      AND (cf.fleet_grp = ANY(%(fleets)s) OR cf.fleet_grp IS NULL)
                      AND (cf.eff_dt IS NULL OR cf.eff_dt <= %(end)s)
                      AND (cf.exp_dt IS NULL OR cf.exp_dt >= %(start)s))
        ORDER BY c.crew_id::bigint
        """,
        {"division": division, "bases": bases, "fleets": fleets,
         "start": sc["start"], "end": sc["end"]},
    )
    ids = [r[0] for r in cur.fetchall()]
    cur.close()
    c["scenario_crew_ids"] = ids
    return ids


def flight_pool_ids(conn, ctx) -> list[int]:
    """Flight ids in scope: fleet ∈ filter_params.crew.fleets, flt_dt within the
    buffered window, live (scenario_id=0), not deleted."""
    c = _cache(ctx)
    if "flight_pool_ids" in c:
        return c["flight_pool_ids"]
    sc = get_scenario(conn, ctx)
    fleets = sc["filter"].get("crew", {}).get("fleets") or []
    lo = sc["start"] - timedelta(days=_COF_LEAD_DAYS)
    hi = sc["end"] + timedelta(days=_COF_TAIL_DAYS)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT f.id FROM flight f
        WHERE f.fleet = ANY(%(fleets)s)
          AND f.flt_dt >= %(lo)s AND f.flt_dt < %(hi)s
          AND (f.scenario_id = 0 OR f.scenario_id IS NULL)
          AND (f.is_deleted = 0 OR f.is_deleted IS NULL)
        """,
        {"fleets": fleets, "lo": lo, "hi": hi},
    )
    ids = [r[0] for r in cur.fetchall()]
    cur.close()
    c["flight_pool_ids"] = ids
    return ids


def cof_crew_ids(conn, ctx) -> list[str]:
    """Distinct roster_flight crew on the scenario flight pool, minus the scenario set."""
    c = _cache(ctx)
    if "cof_crew_ids" in c:
        return c["cof_crew_ids"]
    pool = flight_pool_ids(conn, ctx)
    scen = set(scenario_crew_ids(conn, ctx))
    if not pool:
        c["cof_crew_ids"] = []
        return []
    cur = conn.cursor()
    cur.execute(
        """
        SELECT DISTINCT rf.crew_id FROM roster_flight rf
        WHERE rf.scenario_id = 0 AND rf.flt_id = ANY(%(pool)s)
          AND rf.crew_id IS NOT NULL
        ORDER BY rf.crew_id::bigint
        """,
        {"pool": pool},
    )
    ids = [r[0] for r in cur.fetchall() if r[0] not in scen]
    cur.close()
    c["cof_crew_ids"] = ids
    return ids
```

- [ ] **Step 4: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_context.py -v`
Expected: 3 passed. `test_scenario_crew_ids_match_golden_exactly` is the linchpin — if it fails, the predicate is wrong; compare `got` vs golden and adjust the WHERE (do NOT weaken the test). Verified working query is above.

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/context.py tests/test_ro_input_context.py
git commit -m "feat(engine-server): scenario context + crew-id set computation (P2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.1: Crew + crew sub-table sections (scenario + COF variants)

**Files:** Create `engine-server/F8/ro_input_builder/sections/crew.py`; Create `engine-server/tests/test_ro_input_crew_sections.py`.

The 7 crew sub-domain tables each emit twice (scenario set, COF set). A factory builds each `SectionSpec` with a `custom` callable that filters the table by the chosen crew-id set.

- [ ] **Step 1: Write the failing tests** — create `engine-server/tests/test_ro_input_crew_sections.py`:

```python
import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden
from F8.ro_input_builder.sections import crew

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
    key = spec.name if not spec.variant else f"{spec.name}({spec.variant})"
    return golden.parse_text(text)[key]


# Header equality for every crew section (scenario + COF variants share columns).
HEADER_CASES = [
    ("Crew", crew.CREW_SCEN), ("Crew(COF)", crew.CREW_COF),
    ("CrewRank", crew.CREW_RANK_SCEN), ("CrewRank(COF)", crew.CREW_RANK_COF),
    ("CrewBase", crew.CREW_BASE_SCEN), ("CrewBase(COF)", crew.CREW_BASE_COF),
    ("CrewFleet", crew.CREW_FLEET_SCEN), ("CrewFleet(COF)", crew.CREW_FLEET_COF),
    ("CrewQualification", crew.CREW_QUAL_SCEN), ("CrewQualification(COF)", crew.CREW_QUAL_COF),
    ("CrewStatus", crew.CREW_STATUS_SCEN), ("CrewStatus(COF)", crew.CREW_STATUS_COF),
    ("CrewCertificate", crew.CREW_CERT_SCEN), ("CrewCertificate(COF)", crew.CREW_CERT_COF),
]


@pytest.mark.parametrize("gkey,spec", HEADER_CASES)
def test_crew_section_header_matches_golden(conn, gold, gkey, spec):
    assert _emit(conn, spec).columns == gold[gkey].columns


def test_scenario_crew_section_emits_exactly_the_26(conn, gold):
    # The scenario Crew set is exactly reproducible -> crewId set must equal golden Crew(26).
    sec = _emit(conn, crew.CREW_SCEN)
    ci = sec.columns.index("crewId")
    got = {int(r[ci]) for r in sec.rows}
    want = {int(r[ci]) for r in gold["Crew"].rows}
    assert got == want


def test_scenario_subtable_rows_belong_to_scenario_crew(conn):
    # Every CrewRank scenario-variant row's crewId must be in the scenario crew set.
    from F8.ro_input_builder import context
    ctx = {"airline": "f8", "scenario": 6}
    scen = {int(x) for x in context.scenario_crew_ids(conn, ctx)}
    sec = _emit(conn, crew.CREW_RANK_SCEN)
    ci = sec.columns.index("crewId")
    assert sec.rows, "scenario CrewRank must be non-empty"
    assert all(int(r[ci]) in scen for r in sec.rows)
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_crew_sections.py -v`
Expected: FAIL (`module 'crew' has no attribute 'CREW_SCEN'`).

- [ ] **Step 3: Implement `engine-server/F8/ro_input_builder/sections/crew.py`**

```python
"""Crew-domain SectionSpecs (scenario + COF variants), filtered by crew-id set."""
from __future__ import annotations

from ..registry import SectionSpec, Col
from .. import registry as _reg
from .. import context

# ── column maps (legacy header order is authoritative; from mapping research) ──

_CREW_COLS = [
    Col("crewId", "crew_id"), Col("employeeNo", "employee_no"), Col("id", "id"),
    Col("interfaceCrewId", "interface_crew_id"), Col("firstName", "first_name"),
    Col("middleName", "middle_name"), Col("lastName", "last_name"),
    Col("preferredName", "preferred_name"), Col("birthday", "birthday"),
    Col("gender", "gender"), Col("division", "division"), Col("emplDt", "empl_dt"),
    Col("retireDt", "retire_dt"), Col("termDt", "term_dt"),
    Col("seniorityNum", "seniority_num"), Col("nationality", "nationality"),
    Col("nationalId", "national_id"), Col("spouseCrewId", "spouse_crew_id"),
    Col("passportFirstName", "passport_first_name"),
    Col("passportMiddleName", "passport_middle_name"),
    Col("passportLastName", "passport_last_name"), Col("remarks", "remarks"),
    Col("filiale", "filiale"), Col("grade", "grade"), Col("status", "status"),
    Col("branchCode", "branch_code"), Col("visaType", "visa_type"),
    Col("birthCountry", "birth_country"), Col("birthPlace", "birth_place"),
    Col("birthPlaceEn", "birth_place_en"), Col("nation", "nation"),
    Col("politics", "politics"), Col("contractType", "contract_type"),
    Col("avatar", "avatar"), Col("telCountryCode", None), Col("tel", "tel"),
    Col("idCard", "id_card"), Col("emailAddr", "email_addr"),
    Col("homeAddress", "home_address"), Col("cityOfResidence", None),
    Col("countryOfResidence", None), Col("postalCode", None),
    Col("stateOfResidence", None), Col("bankAccount", None), Col("tmpName", None),
    Col("crewName", None), Col("crewDivision", None), Col("role", None),
    Col("userDepartment", None), Col("lastPublishDate", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_CREW_RANK_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"),
    Col("interfaceCrewRankId", "interface_crew_rank_id"), Col("acType", "ac_type"),
    Col("fleetGrp", "fleet_grp"), Col("rank", "rank"),
    Col("probationEndDt", "probation_end_dt"), Col("effDt", "eff_dt"),
    Col("expDt", "exp_dt"), Col("position", "position"),
    Col("preCumulatedExpDays", "pre_cumulated_exp_days"), Col("division", "division"),
    Col("companyRank", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_CREW_BASE_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"), Col("base", "base"),
    Col("effDt", "eff_dt"), Col("expDt", "exp_dt"),
    Col("isPrimeBase", "is_prime_base", fmt="bool01"),
    Col("interfaceCrewBaseId", "interface_crew_base_id"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_CREW_FLEET_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"), Col("fleetSpecific", "fleet_specific"),
    Col("effDt", "eff_dt"), Col("expDt", "exp_dt"), Col("acType", "ac_type"),
    Col("fleetGrp", "fleet_grp"), Col("interfaceCrewFleetId", "interface_crew_fleet_id"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_CREW_QUAL_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"),
    Col("interfaceCrewQualId", "interface_crew_qual_id"),
    Col("interfaceQualificationId", "interface_qualification_id"),
    Col("qualification", "qualification"), Col("effDt", "eff_dt"),
    Col("renewedDt", "renewed_dt"), Col("expDt", "exp_dt"),
    Col("fleetSpecific", "fleet_specific"), Col("acType", "ac_type"),
    Col("rank", "rank"), Col("position", "position"),
    Col("isValid", "is_valid", fmt="bool01"), Col("remarks", "remarks"),
    Col("displayFlag", "display_flag", fmt="bool01"),
    Col("remarkDetails", "remark_details"), Col("airport", "airport"),
    Col("trainingStatus", None), Col("projectDate", "project_date"),
    Col("recordStatus", "record_status"), Col("qualificationChangeLabel", None),
    Col("baseMonth", "base_month"), Col("qualificationGroup", None),
    Col("status", "status"), Col("remainDays", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_CREW_STATUS_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"), Col("description", "description"),
    Col("reason", "reason"), Col("status", "status"), Col("effDt", "eff_dt"),
    Col("expDt", "exp_dt"), Col("disable", "disable", fmt="bool01"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_CREW_CERT_COLS = [
    Col("id", "id"), Col("crewId", "crew_id"),
    Col("interfaceCrewCertId", "interface_crew_cert_id"),
    Col("certificate", "certificate"), Col("certificateNo", "certificate_no"),
    Col("effDt", "eff_dt"), Col("invalidDt", "invalid_dt"), Col("expDt", "exp_dt"),
    Col("tmpIssueCountry", "tmp_issue_country"),
    Col("tmpIssueAuthority", "tmp_issue_authority"),
    Col("referenceNo", "reference_no"), Col("referenceId", "reference_id"),
    Col("isValid", "is_valid", fmt="bool01"), Col("remarks", "remarks"),
    Col("firstName", "first_name"), Col("middleName", "middle_name"),
    Col("lastName", "last_name"), Col("isPrimary", "is_primary", fmt="bool01"),
    Col("nationality", "nationality"), Col("surname", "surname"),
    Col("titleName", "title_name"), Col("givenName", "given_name"),
    Col("isCtaSend", None), Col("isMclSend", None), Col("abbr", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _id_set(kind):
    return context.scenario_crew_ids if kind == "scenario" else context.cof_crew_ids


def _make(name, table, cols, kind, variant):
    def _custom(conn, ctx):
        ids = _id_set(kind)(conn, ctx)
        if not ids:
            return []
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_reg.select_list(cols)} FROM {table} "
            f"WHERE crew_id = ANY(%s) ORDER BY id",
            (ids,),
        )
        raw = cur.fetchall()
        cur.close()
        return _reg.apply_formats(cols, raw)
    return SectionSpec(name=name, cols=cols, variant=variant, custom=_custom)


CREW_SCEN = _make("Crew", "crew", _CREW_COLS, "scenario", None)
CREW_COF = _make("Crew", "crew", _CREW_COLS, "cof", "COF")
CREW_RANK_SCEN = _make("CrewRank", "crew_rank", _CREW_RANK_COLS, "scenario", None)
CREW_RANK_COF = _make("CrewRank", "crew_rank", _CREW_RANK_COLS, "cof", "COF")
CREW_BASE_SCEN = _make("CrewBase", "crew_base", _CREW_BASE_COLS, "scenario", None)
CREW_BASE_COF = _make("CrewBase", "crew_base", _CREW_BASE_COLS, "cof", "COF")
CREW_FLEET_SCEN = _make("CrewFleet", "crew_fleet", _CREW_FLEET_COLS, "scenario", None)
CREW_FLEET_COF = _make("CrewFleet", "crew_fleet", _CREW_FLEET_COLS, "cof", "COF")
CREW_QUAL_SCEN = _make("CrewQualification", "crew_qualification", _CREW_QUAL_COLS, "scenario", None)
CREW_QUAL_COF = _make("CrewQualification", "crew_qualification", _CREW_QUAL_COLS, "cof", "COF")
CREW_STATUS_SCEN = _make("CrewStatus", "crew_status", _CREW_STATUS_COLS, "scenario", None)
CREW_STATUS_COF = _make("CrewStatus", "crew_status", _CREW_STATUS_COLS, "cof", "COF")
CREW_CERT_SCEN = _make("CrewCertificate", "crew_certificate", _CREW_CERT_COLS, "scenario", None)
CREW_CERT_COF = _make("CrewCertificate", "crew_certificate", _CREW_CERT_COLS, "cof", "COF")
```

- [ ] **Step 4: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_crew_sections.py -v`
Expected: all passed (14 header + 1 exact-26 + 1 subtable-membership = 16).
If a header test fails, the legacy column list disagrees with the golden header — fetch the golden header (`grep -n "^------CrewX(" complete/F8/6_20260612_125629/ro_input.txt`) and reorder/rename that `_*_COLS` list to match exactly. If a DB column is missing (UndefinedColumn), set that Col's db to `None` and report it. Re-run until green.

- [ ] **Step 5: Manual format spot-check (report, do not assert)**

Because the scenario 26-crew are exactly reproducible, spot-check that a few field VALUES match the golden for one scenario crew (e.g. crewId 274) across `Crew`, `CrewBase` (verify `isPrimeBase` renders `true`/`false` like the golden), `CrewStatus` (`disable`). Run:
```bash
grep -A1 "^------CrewBase(53):" complete/F8/6_20260612_125629/ro_input.txt | head -3
```
and compare to your emitted `CREW_BASE_SCEN` rows for the same crew. If a boolean renders `0/1` where golden shows `true/false` (or vice-versa), fix that Col's `fmt`. Report the spot-check result in your completion message (this catches format bugs the header tests can't).

- [ ] **Step 6: Commit**

```bash
git add F8/ro_input_builder/sections/crew.py tests/test_ro_input_crew_sections.py
git commit -m "feat(engine-server): crew-domain sections (scenario + COF variants) (P2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.2: CrewOnFlight section

`CrewOnFlight(225)` derives from `roster_flight` on the scenario flight pool (live, with a pairing + flight). Single section, no variant. Several legacy columns have no source → emit empty.

**Files:** Modify `engine-server/F8/ro_input_builder/sections/crew.py`; Modify `engine-server/tests/test_ro_input_crew_sections.py`.

- [ ] **Step 1: Append the failing test** to `engine-server/tests/test_ro_input_crew_sections.py`:

```python
def test_crew_on_flight_header_matches_golden(conn, gold):
    sec = _emit(conn, crew.CREW_ON_FLIGHT)
    assert sec.columns == gold["CrewOnFlight"].columns


def test_crew_on_flight_nonempty_and_scoped(conn):
    from F8.ro_input_builder import context
    ctx = {"airline": "f8", "scenario": 6}
    pool = set(context.flight_pool_ids(conn, ctx))
    sec = _emit(conn, crew.CREW_ON_FLIGHT)
    assert sec.rows, "CrewOnFlight must be non-empty"
    fi = sec.columns.index("fltId")
    assert all(int(r[fi]) in pool for r in sec.rows)   # every row is on a pool flight
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_crew_sections.py -k crew_on_flight -v`
Expected: FAIL (`module 'crew' has no attribute 'CREW_ON_FLIGHT'`).

- [ ] **Step 3: Append to `engine-server/F8/ro_input_builder/sections/crew.py`**

```python
_CREW_ON_FLIGHT_COLS = [
    Col("id", "id"), Col("fltId", "flt_id"), Col("crewId", "crew_id"),
    Col("actingRank", "flight_acting_rank"), Col("pairingId", "pairing_id"),
    Col("primeActivity", None), Col("assignment", "assignment"), Col("role", "role"),
    Col("subRole", "sub_role"), Col("seqOrder", "seq_order"), Col("source", "source"),
    Col("scenarioId", "scenario_id"), Col("dutyId", "duty_seq"), Col("rosterId", None),
    Col("fltDt", "flt_dt"), Col("division", "division"),
    Col("activeRank", "active_rank"), Col("position", "position"),
    Col("checkType", "check_type"), Col("tsFlag", "ts_flag"),
    Col("resourceCode", "resource_code"), Col("groupId", "group_id"),
    Col("tmProgramCourseId", "tm_program_course_id"),
    Col("parentTmProgramCourseId", "parent_tm_program_course_id"),
    Col("courseCode", "course_code"), Col("subGroupId", "sub_group_id"),
    Col("subTmProgramCourseId", "sub_tm_program_course_id"),
    Col("subParentTmProgramCourseId", "sub_parent_tm_program_id"),
    Col("subCourseCode", "sub_course_code"), Col("displayOrder", None),
    Col("isExtraCourse", "is_extra_course", fmt="bool01"), Col("remark", None),
    Col("inFlightDuty", None), Col("orderCIC", None), Col("emQuiz", None),
    Col("gender", None), Col("checkingTm", None), Col("isFirstSeg", None),
]


def _crew_on_flight(conn, ctx):
    pool = context.flight_pool_ids(conn, ctx)
    if not pool:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_CREW_ON_FLIGHT_COLS)} FROM roster_flight "
        f"WHERE scenario_id = 0 AND pairing_id IS NOT NULL "
        f"AND flt_id = ANY(%s) ORDER BY id",
        (pool,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_CREW_ON_FLIGHT_COLS, raw)


CREW_ON_FLIGHT = SectionSpec(
    name="CrewOnFlight", cols=_CREW_ON_FLIGHT_COLS, custom=_crew_on_flight,
)
```

> The golden `CrewOnFlight` header may list columns the DB lacks (`primeActivity`, `rosterId`, `displayOrder`, `remark`, `inFlightDuty`, `orderCIC`, `emQuiz`, `gender`, `checkingTm`, `isFirstSeg`) — all mapped to `None` (empty). If the header test fails on column order/names, fetch `grep -n "^------CrewOnFlight(" complete/F8/6_20260612_125629/ro_input.txt` and align `_CREW_ON_FLIGHT_COLS` exactly. If `sub_parent_tm_program_id` raises UndefinedColumn, check the real column name in `roster_flight` and fix it (or set to None).

- [ ] **Step 4: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_crew_sections.py -v`
Expected: all passed (16 from Task 2.1 + 2 new = 18).

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/sections/crew.py tests/test_ro_input_crew_sections.py
git commit -m "feat(engine-server): CrewOnFlight section from roster_flight pool (P2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2.3: Register P2 sections + version bump

**Files:** Modify `engine-server/F8/ro_input_builder/registry.py`; Modify `engine-server/tests/test_ro_input_reference_sections.py`; Modify `gantt/src/version.ts`.

- [ ] **Step 1: Append the failing CLI test** to `engine-server/tests/test_ro_input_reference_sections.py`:

```python
def test_cli_build_p2_emits_crew_sections(conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p2")
    text = out.read_text()
    for marker in ["------Crew(", "------Crew(", "(COF):", "------CrewOnFlight(",
                   "------CrewCertificate("]:
        assert marker in text
    # both Crew variants present
    assert "------Crew(" in text and ")(COF):crewId" in text
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_reference_sections.py -k p2 -v`
Expected: FAIL (`KeyError: 'p2'` in `cli.build` registry map).

- [ ] **Step 3: Add `p2_registry()` to `engine-server/F8/ro_input_builder/registry.py`** (append at end)

```python
def p2_registry() -> list[SectionSpec]:
    """P1 sections plus the P2 crew domain (scenario + COF variants + CrewOnFlight).
    Order is provisional; full golden order is fixed in P8 assembly."""
    from .sections import crew as cw
    crew_specs = [
        cw.CREW_SCEN, cw.CREW_RANK_SCEN, cw.CREW_BASE_SCEN, cw.CREW_FLEET_SCEN,
        cw.CREW_QUAL_SCEN, cw.CREW_STATUS_SCEN, cw.CREW_CERT_SCEN, cw.CREW_ON_FLIGHT,
        cw.CREW_COF, cw.CREW_RANK_COF, cw.CREW_BASE_COF, cw.CREW_FLEET_COF,
        cw.CREW_QUAL_COF, cw.CREW_STATUS_COF, cw.CREW_CERT_COF,
    ]
    return p1_registry() + crew_specs
```

- [ ] **Step 4: Wire `"p2"` into `cli.build`** — in `engine-server/F8/ro_input_builder/cli.py`, change the registry map line:

```python
    specs = {"p1": registry.p1_registry, "p2": registry.p2_registry}[registry_name]()
```

- [ ] **Step 5: Run to verify pass + smoke test**

```bash
$PY -m pytest tests/test_ro_input_reference_sections.py -v
$PY -m F8.ro_input_builder --airline f8 --scenario 6 --out /tmp/p2.txt --registry p2
grep -c '^------' /tmp/p2.txt          # expect 22 (P1) + 15 (crew) = 37
grep -oE '^------Crew[A-Za-z]*\([0-9]+\)(\(COF\))?' /tmp/p2.txt
```
Expected: tests pass; 37 sections; the Crew grep shows both scenario and `(COF)` variants. Confirm `Crew(26)` count matches golden (scenario set exact); COF counts will differ from golden (live drift — expected).

- [ ] **Step 6: Bump `BACKEND_VERSION`** in `gantt/src/version.ts` (current 94 → 95).

- [ ] **Step 7: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add engine-server/F8/ro_input_builder/registry.py engine-server/F8/ro_input_builder/cli.py engine-server/tests/test_ro_input_reference_sections.py gantt/src/version.ts
git commit -m "feat(engine-server): P2 registry assembly (crew domain) + BACKEND_VERSION 95

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria for P2

- `$PY -m pytest tests/test_ro_input_context.py tests/test_ro_input_crew_sections.py tests/test_ro_input_reference_sections.py -v` → all pass (DB up).
- Scenario `Crew` set reproduces the golden 26 exactly; all 15 crew sections emit with golden-matching headers; `CrewOnFlight` scoped to the flight pool.
- CLI `--registry p2` emits 37 well-formed sections.

## Known limitations (acceptable per §No-Illusion)

- The `(COF)` crew sets and `CrewOnFlight` cannot byte-match the golden because live `roster_flight`/`flight` data has drifted since the 2026-06-12 snapshot. P2 validates their STRUCTURE (non-empty, disjoint, scoped to the flight pool); exact membership is settled by the P8 end-to-end optimizer run.
- The COF flight-pool buffer (`_COF_LEAD_DAYS=14`, `_COF_TAIL_DAYS=9`) is a tunable heuristic; revisit against the optimizer in P8.
- Ambiguous status fields (`crew.status`, `crew_qualification.status`) map plain (no `bool01`); the Task 2.1 spot-check guards against format drift on the clearly-boolean columns.

## Self-review

- Spec coverage: all 8 crew-domain sections from spec §5 (Crew domain) ✔, both scenario + COF variants ✔, CrewOnFlight ✔.
- Scoping rule (deferred open item from spec §8) resolved: scenario set from `filter_params` (exact), COF set structural ✔.
- Type consistency: `scenario_crew_ids`/`cof_crew_ids`/`flight_pool_ids`/`get_scenario`/`_make`/`select_list`/`apply_formats`/`run_section`/`p1_registry`/`p2_registry` used consistently ✔.
- No placeholders: every spec has a full Col list; every step has runnable code/commands ✔.

# RO Input DB Generation — P5 (Pairing Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Emit the 5 pairing sections — `Pairing`, `PairingComposition`, `PairingDuty`, `PairingDutySegment`, `PairingDutyNode` — from PostgreSQL, reconstructing the old 3-level duty/segment/node hierarchy from the merged wide `pairing_segment` table.

**Architecture:** `Pairing` ← `pairing`; `PairingComposition` ← `pairing_composition`; the duty/segment/node trio all derive from `pairing_segment`. **One synthetic duty-id scheme — `MIN(pairing_segment.id)` per `(pairing_id, duty_seq)` — is shared by `PairingDuty.id`, `PairingDutySegment.pairingDutyId`, and `PairingDutyNode.dutyId`** so all cross-references stay consistent. `PairingDutyNode` is reconstructed in Python: 4 fixed nodes per duty (PICKUP/BRIEF/DEBRIEF/DROPOFF) from the inline `*_utc` columns, +4 when `double_*` is populated.

**Tech Stack:** Python 3.12, psycopg2, pytest. Builds on `engine-server/F8/ro_input_builder/` (P0–P4, merged).

**Spec:** `docs/superpowers/specs/2026-06-15-ro-input-db-generation-design.md`
**Golden:** `engine-server/complete/F8/6_20260612_125629/ro_input.txt`

**Run from `engine-server/`.** `PY=/home/yuan.z/rois/rois-ai/ro-engine/.venv/bin/python`. **Export before every DB test (else skip — must PASS):**
```bash
export LEGACY_RO_DB_URL='postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8'
```

---

## Key facts (verified)

- DB reseeded after the golden snapshot → pairing **content/counts cannot match golden** (live: Pairing 334, PairingComposition 609, duties 368, segments 997; golden 226/390/263/650). Validation is **structural** (headers + scope + reconstruction invariants + cross-references). P8 optimizer run is the functional gate.
- **Pairing scope** (from `scenario.filter_params.pairing`): `base ∈ bases (['YEG'])`, `fleet ∈ fleets (['737'])`, `scenario_id=0`, `is_deleted=0`, overlapping the window `[str_dt_loc, end_dt_loc+1d)`. The `sources` filter is NOT applied (golden pairings have empty source; old generator didn't enforce it).
- **Shared synthetic duty-id = `MIN(pairing_segment.id)` per `(pairing_id, duty_seq)`** — used by PairingDuty.id, PairingDutySegment.pairingDutyId, PairingDutyNode.dutyId.
- **PairingDutyNode reconstruction** (verified against golden + live): per duty (segments sorted by `seg_seq`), emit exactly 4 nodes — all `type='DUTY'`, `fromSegmentId=0`, `toSegmentId=0`, `groupId=1`, `preStartUtc/crewId/schId=NULL`, `isManualModify='false'`, `sequence=duty_seq`:
  | node | airport | startUtc | endUtc |
  |---|---|---|---|
  | PICKUP | first.dep_arp | first.pickup_start_utc | first.pickup_end_utc |
  | BRIEF | first.dep_arp | first.brief_start_utc | first.brief_end_utc |
  | DEBRIEF | last.arv_arp | last.debrief_start_utc | last.debrief_end_utc |
  | DROPOFF | last.arv_arp | last.dropoff_start_utc | last.dropoff_end_utc |
  Node `id` = `first_seg.id * 8 + slot` (PICKUP=0…DROPOFF=3; double +4…+7). When any segment in the duty has `double_brief_start_utc` non-NULL, emit 4 more nodes from the `double_*` columns.
- Cross-cutting: `id→id`, `lastModified→updated_at`, `modifiedBy→updated_by`, `createdDt→created_at`. bool01 noted per section below.

---

## File Structure

```
engine-server/F8/ro_input_builder/
  context.py            # MODIFY: add pairing_ids()
  sections/pairing.py   # NEW: PAIRING, PAIRING_COMPOSITION, PAIRING_DUTY, PAIRING_DUTY_SEGMENT, PAIRING_DUTY_NODE
  registry.py           # MODIFY: add p5_registry()
  cli.py                # MODIFY: wire "p5"
engine-server/tests/
  test_ro_input_pairing_sections.py  # NEW
  test_ro_input_reference_sections.py  # MODIFY: p5 CLI test
```

---

## Task 5.0: Pairing scope + Pairing + PairingComposition

**Files:** Modify `context.py`; Create `engine-server/F8/ro_input_builder/sections/pairing.py`; Create `engine-server/tests/test_ro_input_pairing_sections.py`.

- [ ] **Step 1: Write the failing tests** — create `engine-server/tests/test_ro_input_pairing_sections.py`:

```python
import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden, context
from F8.ro_input_builder.sections import pairing

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


def test_pairing_header_matches_golden(conn, gold):
    assert _emit(conn, pairing.PAIRING).columns == gold["Pairing"].columns


def test_pairing_nonempty_and_scoped(conn):
    sec = _emit(conn, pairing.PAIRING)
    assert sec.rows, "Pairing must be non-empty"
    bi, fi = sec.columns.index("base"), sec.columns.index("fleet")
    assert all(r[bi] == "YEG" for r in sec.rows)
    assert all(r[fi] == "737" for r in sec.rows)


def test_pairing_composition_header_matches_golden(conn, gold):
    assert _emit(conn, pairing.PAIRING_COMPOSITION).columns == gold["PairingComposition"].columns


def test_pairing_composition_scoped_to_pairings(conn):
    ctx = {"airline": "f8", "scenario": 6}
    pids = set(context.pairing_ids(conn, ctx))
    sec = _emit(conn, pairing.PAIRING_COMPOSITION)
    pi = sec.columns.index("pairingId")
    assert sec.rows and all(int(r[pi]) in pids for r in sec.rows)
```

- [ ] **Step 2: Run to verify failure** — `$PY -m pytest tests/test_ro_input_pairing_sections.py -v` → FAIL (`module 'pairing' not found`). Must fail, not skip.

- [ ] **Step 3: Add `pairing_ids` to `context.py`** (append)

```python
def pairing_ids(conn, ctx) -> list[int]:
    """In-scope pairing ids: base/fleet from filter_params.pairing, live (scenario_id=0),
    not deleted, overlapping the scenario window. (sources filter not applied.)"""
    c = _cache(ctx)
    if "pairing_ids" in c:
        return c["pairing_ids"]
    sc = get_scenario(conn, ctx)
    p = sc["filter"].get("pairing", {})
    bases = p.get("bases") or []
    fleets = p.get("fleets") or []
    end_excl = sc["end"] + timedelta(days=1)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id FROM pairing
        WHERE scenario_id = 0 AND is_deleted = 0
          AND base = ANY(%(bases)s) AND fleet = ANY(%(fleets)s)
          AND sch_end_dt_utc >= %(start)s AND sch_str_dt_utc < %(end_excl)s
        """,
        {"bases": bases, "fleets": fleets, "start": sc["start"], "end_excl": end_excl},
    )
    ids = [r[0] for r in cur.fetchall()]
    cur.close()
    c["pairing_ids"] = ids
    return ids
```

- [ ] **Step 4: Create `engine-server/F8/ro_input_builder/sections/pairing.py`** with `PAIRING` + `PAIRING_COMPOSITION`

```python
"""Pairing-layer SectionSpecs. Pairing + PairingComposition map to their tables;
Duty/Segment/Node derive from the merged wide pairing_segment table."""
from __future__ import annotations

from itertools import groupby

from ..registry import SectionSpec, Col
from .. import registry as _reg
from .. import context
from .. import emitter

_PAIRING_COLS = [
    Col("id", "id"), Col("scenarioId", "scenario_id"), Col("ver", "ver"),
    Col("pairingDt", "pairing_dt"), Col("label", "pairing_label"),
    Col("filiale", "filiale"), Col("division", "division"), Col("base", "base"),
    Col("schStrDtUtc", "sch_str_dt_utc"), Col("schEndDtUtc", "sch_end_dt_utc"),
    Col("assignmentGroup", "assignment_group"), Col("assignment", "assignment"),
    Col("attributes", None), Col("tags", "tags"), Col("fleet", "fleet"),
    Col("durationDays", "duration_days"), Col("tafb", "tafb"),
    Col("comments", "comments"), Col("preference", "preference"),
    Col("isDeleted", "is_deleted", fmt="bool01"), Col("createdBy", "created_by"),
    Col("createdDt", "created_at"), Col("rankCombC9aP", None),
    Col("rankCombC9aC", None), Col("rankCombC9aA", None), Col("ggyBlh", "ggy_blh"),
    Col("liveId", "live_id"), Col("interfaceId", "interface_id"),
    Col("actStrDtUtc", "act_str_dt_utc"), Col("actEndDtUtc", "act_end_dt_utc"),
    Col("source", "source"), Col("tagForRequest", None),
    Col("perDiemMins", "per_diem_mins"),
    Col("perDiemMinsAdjustment", "per_diem_mins_adjustment"),
    Col("wpMins", "wp_mins"), Col("wpMinsAdjustment", "wp_mins_adjustment"),
    Col("tagSet", None), Col("manualLabel", None), Col("minAtdo", None),
    Col("minExdo", None), Col("actStartDtUtc", None), Col("actionDtUtc", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_PAIRING_COMP_COLS = [
    Col("id", "id"), Col("scenarioId", "scenario_id"), Col("pairingId", "pairing_id"),
    Col("division", "division"), Col("actingRank", "acting_rank"),
    Col("planValue", "plan"), Col("isDeleted", "is_deleted", fmt="bool01"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _pairing(conn, ctx):
    ids = context.pairing_ids(conn, ctx)
    if not ids:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_PAIRING_COLS)} FROM pairing "
        f"WHERE id = ANY(%s) ORDER BY id",
        (ids,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_PAIRING_COLS, raw)


def _pairing_composition(conn, ctx):
    ids = context.pairing_ids(conn, ctx)
    if not ids:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_PAIRING_COMP_COLS)} FROM pairing_composition "
        f"WHERE pairing_id = ANY(%s) ORDER BY id",
        (ids,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_PAIRING_COMP_COLS, raw)


PAIRING = SectionSpec(name="Pairing", cols=_PAIRING_COLS, custom=_pairing)
PAIRING_COMPOSITION = SectionSpec(
    name="PairingComposition", cols=_PAIRING_COMP_COLS, custom=_pairing_composition,
)
```

- [ ] **Step 5: Run to verify pass** — `$PY -m pytest tests/test_ro_input_pairing_sections.py -v` → 4 passed. Fix any header mismatch against `grep -n "^------Pairing(" / "^------PairingComposition(" complete/F8/6_20260612_125629/ro_input.txt`; fix any UndefinedColumn via `information_schema`.

- [ ] **Step 6: Commit**

```bash
git add F8/ro_input_builder/context.py F8/ro_input_builder/sections/pairing.py tests/test_ro_input_pairing_sections.py
git commit -m "feat(engine-server): Pairing + PairingComposition sections + pairing scope (P5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5.1: PairingDuty + PairingDutySegment

Both derive from `pairing_segment`. PairingDuty = one row per `(pairing_id, duty_seq)` via `DISTINCT ON … ORDER BY pairing_id, duty_seq, id` (so the kept row's `id` = MIN id = the synthetic duty-id). PairingDutySegment = every segment row, with `pairingDutyId` = `min(id) OVER (PARTITION BY pairing_id, duty_seq)` (same synthetic duty-id).

**Files:** Modify `engine-server/F8/ro_input_builder/sections/pairing.py`; Modify `engine-server/tests/test_ro_input_pairing_sections.py`.

- [ ] **Step 1: Append the failing tests**

```python
def test_pairing_duty_header_matches_golden(conn, gold):
    assert _emit(conn, pairing.PAIRING_DUTY).columns == gold["PairingDuty"].columns


def test_pairing_duty_segment_header_matches_golden(conn, gold):
    assert _emit(conn, pairing.PAIRING_DUTY_SEGMENT).columns == gold["PairingDutySegment"].columns


def test_segment_pairingDutyId_references_a_duty(conn):
    duties = _emit(conn, pairing.PAIRING_DUTY)
    segs = _emit(conn, pairing.PAIRING_DUTY_SEGMENT)
    di = duties.columns.index("id")
    duty_ids = {r[di] for r in duties.rows}
    pi = segs.columns.index("pairingDutyId")
    assert segs.rows and all(r[pi] in duty_ids for r in segs.rows)


def test_one_duty_row_per_pairing_duty_seq(conn):
    duties = _emit(conn, pairing.PAIRING_DUTY)
    pi = duties.columns.index("pairingId")
    si = duties.columns.index("dutySeq")
    keys = [(r[pi], r[si]) for r in duties.rows]
    assert len(keys) == len(set(keys))      # unique (pairing, dutySeq)
```

- [ ] **Step 2: Run to verify failure** — `$PY -m pytest tests/test_ro_input_pairing_sections.py -k "duty" -v` → FAIL (`PAIRING_DUTY` missing).

- [ ] **Step 3: Append to `engine-server/F8/ro_input_builder/sections/pairing.py`**

```python
_DUTY_COLS = [
    Col("id", "id"), Col("scenarioId", "scenario_id"), Col("pairingId", "pairing_id"),
    Col("dutySeq", "duty_seq"), Col("hotelId", "duty_hotel_id"),
    Col("isDeleted", "is_deleted", fmt="bool01"), Col("assignment", "duty_assignment"),
    Col("fdpDiscretionMin", "duty_fdp_discretion_min"), Col("maxFdpMin", "duty_max_fdp_min"),
    Col("minimalRestMinutes", "duty_sch_rest_min"), Col("actualRestMinutes", "duty_act_rest_min"),
    Col("createdBy", "created_by"), Col("createdDt", "created_at"),
    Col("isManualModify", "duty_is_manual_modify", fmt="bool01"),
    Col("refTz", "duty_ref_tz"), Col("etrTz", "duty_etr_tz"),
    Col("accState", "duty_acc_state"), Col("actStrDtUtc", "duty_act_str_dt_utc"),
    Col("actEndDtUtc", "duty_act_end_dt_utc"), Col("strArp", "duty_str_arp"),
    Col("endArp", "duty_end_arp"), Col("layoverNights", "duty_layover_nits"),
    Col("planFlightMinutes", "duty_sch_flt_min"), Col("planFdpMinutes", "duty_sch_fdp_min"),
    Col("actFlightMinutes", "duty_act_flt_min"), Col("actFdpMinutes", "duty_act_fdp_min"),
    Col("actualDutyMinutes", "duty_act_duty_min"),
    Col("creditedMinutes", "duty_act_credited_minutes"),
    Col("discretionType", "duty_discretion_type"), Col("comments", "duty_comments"),
    Col("trainingAddTime", "duty_training_add_time"), Col("plnWpMin", "duty_sch_wp_min"),
    Col("actWpMin", "duty_act_wp_min"), Col("wpAdjustment", "duty_wp_adjustment"),
    Col("actDpMin", "duty_act_dp_min"), Col("maxFlightMin", None),
    Col("manualFdpDiscretion", None), Col("manualDpDiscretion", None),
    Col("manualFtDiscretion", None), Col("manualRestDiscretion", None),
    Col("manualSectorDiscretion", None), Col("attribute", None),
    Col("isManualMaxFDP", "duty_is_manual_max_fdp", fmt="bool01"),
    Col("actStartDtUtc", None), Col("startAirport", "duty_str_arp"),
    Col("endAirport", "duty_end_arp"), Col("crewId", None),
    Col("actStrDtUtcLocal", None), Col("actEndDtUtcLocal", None), Col("assType", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_SEG_COLS = [
    Col("id", "id"), Col("scenarioId", "scenario_id"), Col("pairingId", "pairing_id"),
    Col("pairingDutyId", "min(id) OVER (PARTITION BY pairing_id, duty_seq)"),
    Col("dutySeq", "duty_seq"), Col("segSeq", "seg_seq"), Col("fltId", "flt_id"),
    Col("fltDt", "flt_dt"), Col("assignment", "seg_assignment"),
    Col("createdBy", "created_by"), Col("createdDt", "created_at"),
    Col("rankCombC9aP", None), Col("rankCombC9aC", None), Col("rankCombC9aA", None),
    Col("actStrDtUtc", "act_str_dt_utc"), Col("actEndDtUtc", "act_end_dt_utc"),
    Col("airline", "airline"), Col("fltNum", "flt_num"), Col("depArp", "dep_arp"),
    Col("arvArp", "arv_arp"), Col("fleet", "fleet_seg"),
    Col("isDeleted", "is_deleted", fmt="bool01"),
    Col("isLongTransit", "is_long_transit", fmt="bool01"), Col("wpMins", "wp_mins_seg"),
    Col("actStartDtUtc", None), Col("depStation", "dep_arp"), Col("arvStation", "arv_arp"),
    Col("schStartDtUtc", "sch_str_dt_utc"), Col("schEndDtUtc", "sch_end_dt_utc"),
    Col("schStartDtLocal", None), Col("schEndDtLocal", None),
    Col("actStartDtLocal", None), Col("actEndDtLocal", None),
    Col("dutyCodeType", None), Col("newDutyCode", None), Col("isManual", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]


def _pairing_duty(conn, ctx):
    ids = context.pairing_ids(conn, ctx)
    if not ids:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT DISTINCT ON (pairing_id, duty_seq) {_reg.select_list(_DUTY_COLS)} "
        f"FROM pairing_segment WHERE pairing_id = ANY(%s) AND is_deleted = 0 "
        f"ORDER BY pairing_id, duty_seq, id",
        (ids,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_DUTY_COLS, raw)


def _pairing_duty_segment(conn, ctx):
    ids = context.pairing_ids(conn, ctx)
    if not ids:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_SEG_COLS)} FROM pairing_segment "
        f"WHERE pairing_id = ANY(%s) AND is_deleted = 0 ORDER BY id",
        (ids,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_SEG_COLS, raw)


PAIRING_DUTY = SectionSpec(name="PairingDuty", cols=_DUTY_COLS, custom=_pairing_duty)
PAIRING_DUTY_SEGMENT = SectionSpec(
    name="PairingDutySegment", cols=_SEG_COLS, custom=_pairing_duty_segment,
)
```

> If a header test fails, align `_DUTY_COLS`/`_SEG_COLS` to `grep -n "^------PairingDuty(" / "^------PairingDutySegment(" complete/F8/6_20260612_125629/ro_input.txt`. If a `duty_*`/seg column raises UndefinedColumn, verify the real name in `information_schema` (table `pairing_segment`) — note `duty_layover_nits` (typo, not `nights`), `fleet_seg`, `wp_mins_seg`, `seg_assignment`.

- [ ] **Step 4: Run to verify pass** — `$PY -m pytest tests/test_ro_input_pairing_sections.py -v` → 8 passed.

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/sections/pairing.py tests/test_ro_input_pairing_sections.py
git commit -m "feat(engine-server): PairingDuty + PairingDutySegment from pairing_segment (P5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5.2: PairingDutyNode reconstruction

Reconstruct 4 nodes per duty (PICKUP/BRIEF/DEBRIEF/DROPOFF) from the inline `*_utc` columns, +4 from `double_*` when populated. Built in Python.

**Files:** Modify `engine-server/F8/ro_input_builder/sections/pairing.py`; Modify `engine-server/tests/test_ro_input_pairing_sections.py`.

- [ ] **Step 1: Append the failing tests**

```python
def test_pairing_duty_node_header_matches_golden(conn, gold):
    assert _emit(conn, pairing.PAIRING_DUTY_NODE).columns == gold["PairingDutyNode"].columns


def test_node_constants_and_taxonomy(conn):
    sec = _emit(conn, pairing.PAIRING_DUTY_NODE)
    assert sec.rows
    ti = sec.columns.index("type")
    ni = sec.columns.index("node")
    gi = sec.columns.index("groupId")
    fi = sec.columns.index("fromSegmentId")
    assert all(r[ti] == "DUTY" for r in sec.rows)
    assert all(r[ni] in {"PICKUP", "BRIEF", "DEBRIEF", "DROPOFF"} for r in sec.rows)
    assert all(r[gi] == "1" for r in sec.rows)
    assert all(r[fi] == "0" for r in sec.rows)


def test_node_dutyId_references_a_duty(conn):
    duties = _emit(conn, pairing.PAIRING_DUTY)
    nodes = _emit(conn, pairing.PAIRING_DUTY_NODE)
    duty_ids = {r[duties.columns.index("id")] for r in duties.rows}
    ndi = nodes.columns.index("dutyId")
    assert all(r[ndi] in duty_ids for r in nodes.rows)


def test_node_count_is_four_per_duty_without_doubles(conn):
    # In the absence of double_* data, each duty yields exactly 4 nodes.
    duties = _emit(conn, pairing.PAIRING_DUTY)
    nodes = _emit(conn, pairing.PAIRING_DUTY_NODE)
    # node count must be a multiple of 4 and >= 4 * number_of_duties
    assert len(nodes.rows) >= 4 * len(duties.rows)
    assert len(nodes.rows) % 4 == 0
```

- [ ] **Step 2: Run to verify failure** — `$PY -m pytest tests/test_ro_input_pairing_sections.py -k node -v` → FAIL (`PAIRING_DUTY_NODE` missing).

- [ ] **Step 3: Append to `engine-server/F8/ro_input_builder/sections/pairing.py`**

```python
_NODE_HEADERS = [
    "id", "scenarioId", "pairingId", "dutyId", "sequence", "type", "node",
    "fromSegmentId", "toSegmentId", "groupId", "airport", "startUtc", "endUtc",
    "preStartUtc", "crewId", "isManualModify", "schId", "lastModified", "modifiedBy",
]

# pairing_segment columns fetched for node reconstruction (index order below).
_NODE_FETCH = (
    "id, scenario_id, pairing_id, duty_seq, seg_seq, dep_arp, arv_arp, "
    "pickup_start_utc, pickup_end_utc, brief_start_utc, brief_end_utc, "
    "debrief_start_utc, debrief_end_utc, dropoff_start_utc, dropoff_end_utc, "
    "double_pickup_start_utc, double_pickup_end_utc, double_brief_start_utc, "
    "double_brief_end_utc, double_debrief_start_utc, double_debrief_end_utc, "
    "double_dropoff_start_utc, double_dropoff_end_utc, updated_at, updated_by"
)
# index map
_I_ID, _I_SCEN, _I_PID, _I_DSEQ = 0, 1, 2, 3
_I_DEP, _I_ARV = 5, 6
_I_PICK_S, _I_PICK_E, _I_BRIEF_S, _I_BRIEF_E = 7, 8, 9, 10
_I_DEB_S, _I_DEB_E, _I_DROP_S, _I_DROP_E = 11, 12, 13, 14
_I_DPICK_S, _I_DPICK_E, _I_DBRIEF_S, _I_DBRIEF_E = 15, 16, 17, 18
_I_DDEB_S, _I_DDEB_E, _I_DDROP_S, _I_DDROP_E = 19, 20, 21, 22
_I_UA, _I_UB = 23, 24


def _pairing_duty_node(conn, ctx):
    ids = context.pairing_ids(conn, ctx)
    if not ids:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_NODE_FETCH} FROM pairing_segment "
        f"WHERE pairing_id = ANY(%s) AND is_deleted = 0 "
        f"ORDER BY pairing_id, duty_seq, seg_seq",
        (ids,),
    )
    rows = cur.fetchall()
    cur.close()

    out = []
    for _key, grp in groupby(rows, key=lambda r: (r[_I_PID], r[_I_DSEQ])):
        segs = list(grp)
        first, last = segs[0], segs[-1]
        duty_id = min(s[_I_ID] for s in segs)
        scen, pid, dseq = first[_I_SCEN], first[_I_PID], first[_I_DSEQ]
        ua, ub = first[_I_UA], first[_I_UB]

        def _node(slot, name, airport, start, end):
            return [first[_I_ID] * 8 + slot, scen, pid, duty_id, dseq, "DUTY", name,
                    0, 0, 1, airport, start, end, None, None, "false", None, ua, ub]

        out.append(_node(0, "PICKUP", first[_I_DEP], first[_I_PICK_S], first[_I_PICK_E]))
        out.append(_node(1, "BRIEF", first[_I_DEP], first[_I_BRIEF_S], first[_I_BRIEF_E]))
        out.append(_node(2, "DEBRIEF", last[_I_ARV], last[_I_DEB_S], last[_I_DEB_E]))
        out.append(_node(3, "DROPOFF", last[_I_ARV], last[_I_DROP_S], last[_I_DROP_E]))

        if any(s[_I_DBRIEF_S] is not None for s in segs):
            fd = next((s for s in segs if s[_I_DBRIEF_S] is not None), first)
            ld = next((s for s in reversed(segs) if s[_I_DDEB_S] is not None), last)
            out.append(_node(4, "PICKUP", fd[_I_DEP], fd[_I_DPICK_S], fd[_I_DPICK_E]))
            out.append(_node(5, "BRIEF", fd[_I_DEP], fd[_I_DBRIEF_S], fd[_I_DBRIEF_E]))
            out.append(_node(6, "DEBRIEF", ld[_I_ARV], ld[_I_DDEB_S], ld[_I_DDEB_E]))
            out.append(_node(7, "DROPOFF", ld[_I_ARV], ld[_I_DDROP_S], ld[_I_DDROP_E]))

    return [[emitter.format_value(v) for v in r] for r in out]


PAIRING_DUTY_NODE = SectionSpec(
    name="PairingDutyNode", cols=[Col(h) for h in _NODE_HEADERS], custom=_pairing_duty_node,
)
```

> `groupby` requires the input sorted by the group key — the SQL `ORDER BY pairing_id, duty_seq, seg_seq` guarantees it. If the header test fails, align `_NODE_HEADERS` to `grep -n "^------PairingDutyNode(" complete/F8/6_20260612_125629/ro_input.txt`.

- [ ] **Step 4: Run to verify pass** — `$PY -m pytest tests/test_ro_input_pairing_sections.py -v` → 12 passed.

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/sections/pairing.py tests/test_ro_input_pairing_sections.py
git commit -m "feat(engine-server): PairingDutyNode reconstruction from pairing_segment (P5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5.3: Register P5 + version bump

**Files:** Modify `registry.py`, `cli.py`, `tests/test_ro_input_reference_sections.py`, `gantt/src/version.ts`.

- [ ] **Step 1: Append the failing CLI test** to `engine-server/tests/test_ro_input_reference_sections.py`:

```python
def test_cli_build_p5_emits_pairing_sections(conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p5")
    text = out.read_text()
    for marker in ["------Pairing(", "------PairingComposition(", "------PairingDuty(",
                   "------PairingDutySegment(", "------PairingDutyNode(", "------Flight("]:
        assert marker in text
```

- [ ] **Step 2: Run to verify failure** — `$PY -m pytest tests/test_ro_input_reference_sections.py -k p5 -v` → FAIL (KeyError 'p5').

- [ ] **Step 3: Add `p5_registry()` to `registry.py`** (append)

```python
def p5_registry() -> list[SectionSpec]:
    """P4 sections plus the pairing layer. Order provisional (P8 fixes it)."""
    from .sections import pairing as pa
    return p4_registry() + [
        pa.PAIRING, pa.PAIRING_COMPOSITION, pa.PAIRING_DUTY,
        pa.PAIRING_DUTY_SEGMENT, pa.PAIRING_DUTY_NODE,
    ]
```

- [ ] **Step 4: Wire `"p5"` into `cli.py`** — extend the registry map:

```python
    specs = {"p1": registry.p1_registry, "p2": registry.p2_registry,
             "p3": registry.p3_registry, "p4": registry.p4_registry,
             "p5": registry.p5_registry}[registry_name]()
```

- [ ] **Step 5: Run to verify pass + smoke test**

```bash
$PY -m pytest tests/test_ro_input_reference_sections.py -v
$PY -m F8.ro_input_builder --airline f8 --scenario 6 --out /tmp/p5.txt --registry p5
grep -c '^------' /tmp/p5.txt                      # expect 51 (46 P4 + 5)
grep -E '^------Pairing[A-Za-z]*\([0-9]+\)' /tmp/p5.txt
```
Expected: tests pass; 51 sections; pairing sections with live counts (NOT golden — reseed).

- [ ] **Step 6: Bump `BACKEND_VERSION`** in `gantt/src/version.ts` (97 → 98).

- [ ] **Step 7: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add engine-server/F8/ro_input_builder/registry.py engine-server/F8/ro_input_builder/cli.py engine-server/tests/test_ro_input_reference_sections.py gantt/src/version.ts
git commit -m "feat(engine-server): P5 registry assembly (pairing layer) + BACKEND_VERSION 98

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria for P5

- `$PY -m pytest tests/test_ro_input_pairing_sections.py tests/test_ro_input_reference_sections.py -v` → all pass.
- All 5 pairing headers match golden; PairingDutySegment.pairingDutyId & PairingDutyNode.dutyId both reference PairingDuty.id (cross-references consistent); nodes are 4-per-duty with the correct taxonomy; `--registry p5` emits 51 sections.

## Known limitations (per §No-Illusion)

- DB reseed → counts can't match golden (structural validation only). P8 optimizer run is the functional gate.
- `PairingDutyNode` reconstruction reproduces the golden's only observed shape (4 DUTY nodes/duty + double handling). If live data contains node shapes not in the golden corpus, the optimizer run (P8) will surface them.
- Synthetic duty-id = `MIN(pairing_segment.id)` per `(pairing_id, duty_seq)`; node id = `first_seg.id*8+slot`. Stable within a DB load.

## Self-review

- Spec coverage: Pairing, PairingComposition, PairingDuty, PairingDutySegment, PairingDutyNode (spec §5 "Pairing layer") ✔. Duty/node reconstruction resolved ✔.
- Cross-reference consistency: one shared synthetic duty-id across the three derived sections ✔.
- Type consistency: `pairing_ids`/`select_list`/`apply_formats`/`format_value`/`run_section`/`p4_registry`/`p5_registry` consistent ✔.
- No placeholders: full Col lists + concrete node algorithm ✔.

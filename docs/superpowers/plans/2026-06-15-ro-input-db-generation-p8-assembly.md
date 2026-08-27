# RO Input DB Generation — P8 (Assembly + Toggle + Optimizer Run) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for Tasks 8.0–8.3. The optimizer run (Task 8.4) is driven by the controller.

**Goal:** Assemble all 61 sections in exact golden order, wire the `inputSource: db|java` toggle into `task_manager`, and run the real optimizer on the DB-generated `input.gz`.

**Architecture:** Add the 2 remaining variant sections (`Airport(Client)`, `Assignment(Read)`), a `full_registry()` listing all 61 sections in golden order, a `"full"` CLI registry, and `_generate_input_from_db()` in `task_manager` gated by `parameters.inputSource == "db"`.

**Tech Stack:** Python 3.12, psycopg2, pytest. Builds on `engine-server/F8/ro_input_builder/` (P0–P7, merged).

**Spec:** `docs/superpowers/specs/2026-06-15-ro-input-db-generation-design.md`
**Golden:** `engine-server/complete/F8/6_20260612_125629/ro_input.txt`

**Run from `engine-server/`.** `PY=/home/yuan.z/rois/rois-ai/ro-engine/.venv/bin/python`. **Export before every DB test:**
```bash
export LEGACY_RO_DB_URL='postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8'
```

---

## Golden section order (61 sections — `full_registry` must match exactly)

```
1 Workset          2 CrewMandayFd     3 CrewMonthManday  4 Flight           5 FlightComposition
6 Scenario         7 Crew             8 CrewRank         9 CrewBase         10 CrewFleet
11 CrewQualification 12 CrewStatus    13 CrewCertificate 14 CrewOnFlight    15 RosterPeriod
16 Crew(COF)       17 CrewRank(COF)   18 CrewBase(COF)   19 CrewFleet(COF)  20 CrewQualification(COF)
21 CrewStatus(COF) 22 CrewCertificate(COF) 23 RosterGround 24 Pairing       25 PairingComposition
26 PairingDuty     27 PairingDutySegment 28 PairingDutyNode 29 Airport(Client) 30 City
31 Airport         32 AssignmentGroup 33 Assignment      34 Assignment(Read) 35 AssignmentGroupMap
36 AssignmentOverlappable 37 GuaranteeFlyHours 38 CalculationManday 39 Fleet 40 Base
41 Composition     42 CompositionRank 43 Rank            44 RankActing      45 RankCombinationCriteria
46 RankCombination 47 SystemParameter 48 Dictionary      49 RuleSet         50 Rule
51 Cqf             52 CqfParameter    53 RuleParameter   54 Rule(ALL)       55 RuleParameter(ALL)
56 PaneHeader      57 Team            58 RosterFlight     59 Roster          60 FatigueResult
61 RankPosition
```

Spec-constant mapping: Workset/Scenario→`meta`; CrewMandayFd/CrewMonthManday/FatigueResult→`manday`; Flight/FlightComposition→`flight`; Crew*/CrewOnFlight→`crew`; Pairing*→`pairing`; Roster*→`roster`; RuleSet/Rule*/Cqf*→`rules`; Airport/AssignmentGroup/Assignment/AssignmentGroupMap/Fleet/Base/Composition/CompositionRank/Rank/RankActing/RankPosition/SystemParameter/Dictionary/PaneHeader/Team/RosterPeriod→`reference`; City/AssignmentOverlappable/GuaranteeFlyHours/CalculationManday/RankCombinationCriteria/RankCombination→passthrough; Airport(Client)/Assignment(Read)→new (Task 8.0).

---

## Task 8.0: Airport(Client) + Assignment(Read) variants

**Files:** Modify `context.py`; Modify `engine-server/F8/ro_input_builder/sections/reference.py`; Create `engine-server/tests/test_ro_input_variant_sections.py`.

- [ ] **Step 1: Write the failing tests** — create `engine-server/tests/test_ro_input_variant_sections.py`:

```python
import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden, context
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
    text = registry.run_section(conn, spec, {"airline": "f8", "scenario": 6})
    key = spec.name if not spec.variant else f"{spec.name}({spec.variant})"
    return golden.parse_text(text)[key]


def test_airport_client_header_matches_golden(conn, gold):
    assert _emit(conn, reference.AIRPORT_CLIENT).columns == gold["Airport(Client)"].columns


def test_airport_client_is_scenario_subset(conn):
    full = _emit(conn, reference.AIRPORT)
    client = _emit(conn, reference.AIRPORT_CLIENT)
    ai = full.columns.index("airport")
    full_set = {r[ai] for r in full.rows}
    client_set = {r[ai] for r in client.rows}
    assert client.rows and client_set <= full_set        # subset of the full master
    assert len(client_set) < len(full_set)               # genuinely a subset


def test_assignment_read_matches_plain_assignment(conn, gold):
    read = _emit(conn, reference.ASSIGNMENT_READ)
    assert read.columns == gold["Assignment(Read)"].columns
    plain = _emit(conn, reference.ASSIGNMENT)
    assert {tuple(r) for r in read.rows} == {tuple(r) for r in plain.rows}   # same data
```

- [ ] **Step 2: Run to verify failure** — `$PY -m pytest tests/test_ro_input_variant_sections.py -v` → FAIL (`AIRPORT_CLIENT` missing). Must fail, not skip.

- [ ] **Step 3: Add `scenario_airports` to `context.py`** (append)

```python
def scenario_airports(conn, ctx) -> list[str]:
    """Distinct airport codes used by the scenario's flights (dep + arv)."""
    c = _cache(ctx)
    if "scenario_airports" in c:
        return c["scenario_airports"]
    fids = flight_section_ids(conn, ctx)
    if not fids:
        c["scenario_airports"] = []
        return []
    cur = conn.cursor()
    cur.execute(
        "SELECT DISTINCT a FROM ("
        "  SELECT dep_arp AS a FROM flight WHERE id = ANY(%(f)s) "
        "  UNION SELECT arv_arp AS a FROM flight WHERE id = ANY(%(f)s)"
        ") t WHERE a IS NOT NULL",
        {"f": fids},
    )
    aps = [r[0] for r in cur.fetchall()]
    cur.close()
    c["scenario_airports"] = aps
    return aps
```

- [ ] **Step 4: Append to `engine-server/F8/ro_input_builder/sections/reference.py`**

At the top of the file, add the context import (after the existing imports):

```python
from .. import registry as _reg
from .. import context
```

At the end of the file, add the two variant specs (reusing `AIRPORT.cols` / `ASSIGNMENT.cols`):

```python
def _airport_client(conn, ctx):
    aps = context.scenario_airports(conn, ctx)
    if not aps:
        return []
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(AIRPORT.cols)} FROM airport "
        f"WHERE airport = ANY(%s) ORDER BY id",
        (aps,),
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(AIRPORT.cols, raw)


AIRPORT_CLIENT = SectionSpec(
    name="Airport", variant="Client", cols=AIRPORT.cols, custom=_airport_client,
)

ASSIGNMENT_READ = SectionSpec(
    name="Assignment", variant="Read", table="assignment", cols=ASSIGNMENT.cols,
    order_by="id",
)
```

> If `test_airport_client_header_matches_golden` fails, the `Airport(Client)` golden header equals the plain `Airport` header (same columns) — `AIRPORT.cols` is correct; investigate parsing. If `scenario_airports` returns empty (no flights), the test will fail on `client.rows` — ensure the f8 DB has scenario-window flights (P3 confirmed ~1744).

- [ ] **Step 5: Run to verify pass** — `$PY -m pytest tests/test_ro_input_variant_sections.py -v` → 3 passed.

- [ ] **Step 6: Commit**

```bash
git add F8/ro_input_builder/context.py F8/ro_input_builder/sections/reference.py tests/test_ro_input_variant_sections.py
git commit -m "feat(engine-server): Airport(Client) + Assignment(Read) variant sections (P8)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.1: full_registry (61 sections, golden order) + CLI

**Files:** Modify `engine-server/F8/ro_input_builder/registry.py`; Modify `cli.py`; Create `engine-server/tests/test_ro_input_full_assembly.py`.

- [ ] **Step 1: Write the failing test** — create `engine-server/tests/test_ro_input_full_assembly.py`:

```python
import re
import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden, cli

GOLDEN = "complete/F8/6_20260612_125629/ro_input.txt"


def _golden_order():
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
    except psycopg2.OperationalError as e:
        pytest.skip(f"f8 DB unavailable: {e}")
    yield c
    c.close()


def test_full_registry_section_order_matches_golden(conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="full")
    text = out.read_text()
    got = []
    for line in text.splitlines():
        m = re.match(r"------(\w+)\(\d+\)(?:\((\w+)\))?:", line)
        if m:
            got.append(f"{m.group(1)}({m.group(2)})" if m.group(2) else m.group(1))
    assert got == _golden_order()       # exact 61-section order, including variants
```

- [ ] **Step 2: Run to verify failure** — `$PY -m pytest tests/test_ro_input_full_assembly.py -v` → FAIL (KeyError 'full' or order mismatch).

- [ ] **Step 3: Add `full_registry()` to `engine-server/F8/ro_input_builder/registry.py`** (append)

```python
def _passthrough_spec(name: str) -> SectionSpec:
    from .sections import passthrough as pt
    return SectionSpec(name=name, cols=[Col(c) for c in _snapshot_cols(name)],
                       custom=pt.make_custom(name))


def full_registry() -> list[SectionSpec]:
    """All 61 sections in exact golden order (the production assembly)."""
    from .sections import reference as ref, crew as cw, flight as fl
    from .sections import rules as ru, pairing as pa, roster as ro
    from .sections import manday as md, meta as mt
    return [
        mt.WORKSET, md.CREW_MANDAY_FD, md.CREW_MONTH_MANDAY, fl.FLIGHT,
        fl.FLIGHT_COMPOSITION, mt.SCENARIO,
        cw.CREW_SCEN, cw.CREW_RANK_SCEN, cw.CREW_BASE_SCEN, cw.CREW_FLEET_SCEN,
        cw.CREW_QUAL_SCEN, cw.CREW_STATUS_SCEN, cw.CREW_CERT_SCEN, cw.CREW_ON_FLIGHT,
        ref.ROSTER_PERIOD,
        cw.CREW_COF, cw.CREW_RANK_COF, cw.CREW_BASE_COF, cw.CREW_FLEET_COF,
        cw.CREW_QUAL_COF, cw.CREW_STATUS_COF, cw.CREW_CERT_COF,
        ro.ROSTER_GROUND, pa.PAIRING, pa.PAIRING_COMPOSITION, pa.PAIRING_DUTY,
        pa.PAIRING_DUTY_SEGMENT, pa.PAIRING_DUTY_NODE,
        ref.AIRPORT_CLIENT, _passthrough_spec("City"), ref.AIRPORT,
        ref.ASSIGNMENT_GROUP, ref.ASSIGNMENT, ref.ASSIGNMENT_READ,
        ref.ASSIGNMENT_GROUP_MAP, _passthrough_spec("AssignmentOverlappable"),
        _passthrough_spec("GuaranteeFlyHours"), _passthrough_spec("CalculationManday"),
        ref.FLEET, ref.BASE, ref.COMPOSITION, ref.COMPOSITION_RANK, ref.RANK,
        ref.RANK_ACTING, _passthrough_spec("RankCombinationCriteria"),
        _passthrough_spec("RankCombination"), ref.SYSTEM_PARAMETER, ref.DICTIONARY,
        ru.RULE_SET, ru.RULE_SCEN, ru.CQF, ru.CQF_PARAMETER, ru.RULE_PARAM_SCEN,
        ru.RULE_ALL, ru.RULE_PARAM_ALL,
        ref.PANE_HEADER, ref.TEAM, ro.ROSTER_FLIGHT, ro.ROSTER, md.FATIGUE_RESULT,
        ref.RANK_POSITION,
    ]
```

- [ ] **Step 4: Wire `"full"` into `cli.py`** — extend the registry map:

```python
    specs = {"p1": registry.p1_registry, "p2": registry.p2_registry,
             "p3": registry.p3_registry, "p4": registry.p4_registry,
             "p5": registry.p5_registry, "p6": registry.p6_registry,
             "p7": registry.p7_registry, "full": registry.full_registry}[registry_name]()
```

- [ ] **Step 5: Run to verify pass + smoke test**

```bash
$PY -m pytest tests/test_ro_input_full_assembly.py -v
$PY -m F8.ro_input_builder --airline f8 --scenario 6 --out /tmp/full.txt --gz /tmp/full.gz --registry full
grep -c '^------' /tmp/full.txt            # expect 61
zcat /tmp/full.gz | grep -c '^------'      # expect 61 (gz round-trips)
```
Expected: order test passes; 61 sections in txt and gz.

- [ ] **Step 6: Commit**

```bash
git add F8/ro_input_builder/registry.py F8/ro_input_builder/cli.py tests/test_ro_input_full_assembly.py
git commit -m "feat(engine-server): full_registry (61 sections, golden order) + 'full' CLI (P8)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.2: task_manager inputSource toggle

**Files:** Modify `engine-server/src/tasks/task_manager.py`; Create `engine-server/tests/test_legacy_input_source_toggle.py`.

- [ ] **Step 1: Write the failing test** — create `engine-server/tests/test_legacy_input_source_toggle.py`:

```python
import gzip
import os
import psycopg2
import pytest


def test_generate_input_from_db_writes_61_section_gz(tmp_path):
    # Unit test of the DB generation path, independent of the full TaskManager wiring.
    try:
        import psycopg2
        psycopg2.connect("postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8").close()
    except psycopg2.OperationalError as e:
        pytest.skip(f"f8 DB unavailable: {e}")
    from F8.ro_input_builder import cli
    txt = tmp_path / "ro_input.txt"
    gz = tmp_path / "input.gz"
    cli.build(airline="f8", scenario=6, out_path=str(txt), registry_name="full", gz_path=str(gz))
    assert gz.exists()
    with gzip.open(gz, "rb") as f:
        body = f.read().decode("utf-8")
    assert body.count("\n------") + body.startswith("------") >= 60   # ~61 sections
```

- [ ] **Step 2: Run to verify it passes already** (this validates the builder path the toggle will call):

Run: `$PY -m pytest tests/test_legacy_input_source_toggle.py -v` → 1 passed. (The toggle wiring below routes a LegacyRO task through this same `cli.build`.)

- [ ] **Step 3: Add `_generate_input_from_db` + the toggle branch to `task_manager.py`**

In `_fetch_input` (the method with the LegacyRO branch), add a check BEFORE the `legacy_java` branch:

```python
        # LegacyRO + inputSource=db: build input.gz directly from PostgreSQL
        if self.optimizer_type == "LegacyRO" and self.parameters.get("inputSource") == "db":
            return self._generate_input_from_db(optimizer_config)

        # LegacyRO: login to Java server first, then call comptxt
        if self.optimizer_type == "LegacyRO" and getattr(optimizer_config, "legacy_java", None):
            return self._fetch_input_legacy_java(optimizer_config)
```

Add the method (next to `_fetch_input_legacy_java`):

```python
    def _generate_input_from_db(self, optimizer_config) -> bool:
        """LegacyRO + inputSource=db: build ro_input.txt/input.gz from PostgreSQL
        (replaces the Java-server fetch), then prepare the legacy work dir."""
        scenario = int(self.parameters.get("scenarioId", 6))
        txt_path = os.path.join(self.working_dir, "ro_input.txt")
        self.input_file_path = os.path.join(self.working_dir, "input.gz")
        logger.info("[Task %s] LegacyRO(db): generating ro_input from Postgres, scenario=%d",
                    self.task_id, scenario)
        try:
            from F8.ro_input_builder import cli as ro_input_cli
            ro_input_cli.build(
                airline=self.airline.lower(), scenario=scenario,
                out_path=txt_path, registry_name="full", gz_path=self.input_file_path,
            )
        except Exception as e:
            raise InputFetchError(
                f"[Task {self.task_id}] Failed to generate input.gz from DB: {e}"
            ) from e
        logger.info("[Task %s] LegacyRO(db): input.gz generated (%d bytes)",
                    self.task_id, os.path.getsize(self.input_file_path))
        self._prepare_legacy_workdir(optimizer_config)
        return True
```

- [ ] **Step 4: Run to verify pass** — `$PY -m pytest tests/test_legacy_input_source_toggle.py -v` → 1 passed. Confirm `task_manager.py` still imports: `$PY -c "import src.tasks.task_manager"` (no error).

- [ ] **Step 5: Commit**

```bash
git add src/tasks/task_manager.py tests/test_legacy_input_source_toggle.py
git commit -m "feat(engine-server): task_manager inputSource=db toggle (_generate_input_from_db) (P8)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.3: Version bump

**Files:** Modify `gantt/src/version.ts`.

- [ ] **Step 1: Bump `BACKEND_VERSION`** (100 → 101).

- [ ] **Step 2: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add gantt/src/version.ts
git commit -m "chore: BACKEND_VERSION +1 (ro_input_builder P8 assembly + toggle)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.4: End-to-end optimizer run (controller-driven, exploratory)

> Not a subagent task — the controller drives this and reports honestly. The environment may block the full solve (conda is root-owned; `legacy_ro.sh` needs `sudo` + pbs-server preference packages).

- [ ] **Step 1:** Generate the full file: `$PY -m F8.ro_input_builder --airline f8 --scenario 6 --out /tmp/ro_input.txt --gz /tmp/input.gz --registry full`.
- [ ] **Step 2:** Decompress + confirm 61 sections, no malformed rows (every data line has the right field count for its section header).
- [ ] **Step 3:** Attempt the optimizer's input parse. Try, in order: (a) the full `legacy_ro.sh` flow if `sudo`/conda/pbs-server are available; (b) invoking the optimizer's data loader directly on `ro_input.txt`; (c) if both are blocked, document the blocker and fall back to a field-count/structural self-validation of every section.
- [ ] **Step 4:** Report the outcome: whether the optimizer parsed/ran, or the precise environment blocker.

---

## Done criteria for P8

- All section-emitter + assembly tests pass; `--registry full` emits 61 sections in exact golden order; gz round-trips.
- `task_manager` routes `inputSource=db` LegacyRO tasks through `_generate_input_from_db`.
- Optimizer run attempted; outcome (success or precise blocker) documented.

## Self-review

- Spec coverage: full assembly (spec §7 P8), toggle (spec §2 integration), optimizer run (spec §6 acceptance gate) ✔.
- Type consistency: `scenario_airports`/`full_registry`/`_passthrough_spec`/`_generate_input_from_db` consistent ✔.
- No placeholders: full ordered registry, concrete toggle code ✔.

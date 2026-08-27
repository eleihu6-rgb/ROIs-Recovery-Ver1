# RO Input DB Generation — P4 (Rules) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Emit the rule-config sections — `RuleSet`, `Rule` (scenario + `(ALL)`), `RuleParameter` (scenario + `(ALL)`), `Cqf`, `CqfParameter` — from PostgreSQL.

**Architecture:** Unscoped full-table dumps (`RuleSet`, `Rule(ALL)`, `RuleParameter(ALL)`, `Cqf`, `CqfParameter`) use the P1 plain `SectionSpec(table=…)` path. The two scenario-scoped variants (`Rule`, `RuleParameter`) use `custom` callables that filter by **`rule_set` membership** (`rule.id IN (SELECT rule_id FROM rule_set)`), since the scenario's rule set in this DB is defined by the `rule_set` table directly.

**Tech Stack:** Python 3.12, psycopg2, pytest. Builds on `engine-server/F8/ro_input_builder/` (P0–P3, merged).

**Spec:** `docs/superpowers/specs/2026-06-15-ro-input-db-generation-design.md`
**Golden:** `engine-server/complete/F8/6_20260612_125629/ro_input.txt`

**Run from `engine-server/`.** `PY=/home/yuan.z/rois/rois-ai/ro-engine/.venv/bin/python`. **Export before every DB test (else skip — must PASS):**
```bash
export LEGACY_RO_DB_URL='postgresql://f8:Pier2026AIf8@localhost:5432/rois?options=-c%20search_path%3Df8'
```

---

## Key facts (verified)

- DB rule tables (f8 schema) are **under-seeded** vs golden: `rule_set`=14 (golden RuleSet 225), `rule`=14 (golden `Rule(ALL)` 829), `rule_parameter`=48 (golden `RuleParameter(ALL)` 4990); `cqf` and `cqf_parameter` are **empty**. Only the scenario's 14 active rules are seeded → `Rule(scenario)`=14 (matches golden count). Builder is correct; counts can't match golden (seeding gap). The P8 optimizer run is the functional gate.
- **Column quirks:** `ruleClass`→`class`, `cqfClass`→`class` (DB dropped the prefix). `ruleApplicability`/`severityColor` have **no DB column** → db=None (UNMAPPED). `severity` is an integer level (NOT bool01).
- `scenario.workset_id` (9006) does NOT match `rule_set.workset_id` (103) — so scenario rules are scoped by **`rule_set` membership** (`rule.id IN (SELECT rule_id FROM rule_set)`), not by the scenario's workset id. (Limitation: assumes `rule_set` holds a single active workset; multi-workset seeding would need the scenario→workset linkage resolved.)
- `RuleSet` is an **unscoped** full-table dump (golden dumps all worksets' rule_set rows).
- Cross-cutting: `id→id`, `lastModified→updated_at`, `modifiedBy→updated_by`.

---

## File Structure

```
engine-server/F8/ro_input_builder/
  sections/rules.py   # NEW: RULE_SET, RULE_SCEN, RULE_ALL, RULE_PARAM_SCEN, RULE_PARAM_ALL, CQF, CQF_PARAMETER
  registry.py         # MODIFY: add p4_registry()
  cli.py              # MODIFY: wire "p4"
engine-server/tests/
  test_ro_input_rule_sections.py  # NEW
  test_ro_input_reference_sections.py  # MODIFY: p4 CLI test
```

---

## Task 4.0: Rule sections (RuleSet, Rule scenario+ALL, RuleParameter scenario+ALL)

**Files:** Create `engine-server/F8/ro_input_builder/sections/rules.py`; Create `engine-server/tests/test_ro_input_rule_sections.py`.

- [ ] **Step 1: Write the failing tests** — create `engine-server/tests/test_ro_input_rule_sections.py`:

```python
import pytest
import psycopg2
from F8.ro_input_builder import db, registry, golden
from F8.ro_input_builder.sections import rules

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


HEADER_CASES = [
    ("RuleSet", rules.RULE_SET), ("Rule", rules.RULE_SCEN), ("Rule(ALL)", rules.RULE_ALL),
    ("RuleParameter", rules.RULE_PARAM_SCEN), ("RuleParameter(ALL)", rules.RULE_PARAM_ALL),
]


@pytest.mark.parametrize("gkey,spec", HEADER_CASES)
def test_rule_section_header_matches_golden(conn, gold, gkey, spec):
    assert _emit(conn, spec).columns == gold[gkey].columns


def test_scenario_rule_ids_equal_rule_set_members(conn):
    # Scenario Rule = rules referenced by rule_set.
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT rule_id FROM rule_set")
    want = {str(r[0]) for r in cur.fetchall()}
    cur.close()
    sec = _emit(conn, rules.RULE_SCEN)
    ii = sec.columns.index("id")
    got = {r[ii] for r in sec.rows}
    assert got == want


def test_scenario_rules_subset_of_all(conn):
    s = _emit(conn, rules.RULE_SCEN)
    a = _emit(conn, rules.RULE_ALL)
    ii = s.columns.index("id")
    sset = {r[ii] for r in s.rows}
    aset = {r[ii] for r in a.rows}
    assert sset and sset <= aset
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_rule_sections.py -v` → FAIL (`module 'rules' not found`). Must fail, not skip.

- [ ] **Step 3: Create `engine-server/F8/ro_input_builder/sections/rules.py`**

```python
"""Rule-config SectionSpecs: RuleSet, Rule (scenario + ALL), RuleParameter
(scenario + ALL). Scenario variants are scoped by rule_set membership."""
from __future__ import annotations

from ..registry import SectionSpec, Col
from .. import registry as _reg

_RULE_SET_COLS = [
    Col("id", "id"), Col("worksetId", "workset_id"), Col("ruleId", "rule_id"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_RULE_COLS = [
    Col("id", "id"), Col("function", "function"), Col("instance", "instance"),
    Col("ruleClass", "class"), Col("description", "description"),
    Col("reference", "reference"), Col("category", "category"),
    Col("storeStructure", "store_structure"), Col("source", "source"),
    Col("detail", "detail"), Col("overridability", "overridability"),
    Col("severity", "severity"), Col("filiale", "filiale"),
    Col("division", "division"), Col("owner", "owner"), Col("locked", "locked"),
    Col("ruleApplicability", None), Col("severityColor", None),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_RULE_PARAM_COLS = [
    Col("id", "id"), Col("ruleId", "rule_id"), Col("phaseId", "phase_id"),
    Col("paramNames", "param_names"), Col("paramValues", "param_values"),
    Col("paramExtra", "param_extra"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

RULE_SET = SectionSpec(name="RuleSet", table="rule_set", cols=_RULE_SET_COLS, order_by="id")
RULE_ALL = SectionSpec(name="Rule", variant="ALL", table="rule", cols=_RULE_COLS, order_by="id")
RULE_PARAM_ALL = SectionSpec(
    name="RuleParameter", variant="ALL", table="rule_parameter",
    cols=_RULE_PARAM_COLS, order_by="id",
)


def _rule_scen(conn, ctx):
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_RULE_COLS)} FROM rule "
        f"WHERE id IN (SELECT rule_id FROM rule_set) ORDER BY id"
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_RULE_COLS, raw)


def _rule_param_scen(conn, ctx):
    cur = conn.cursor()
    cur.execute(
        f"SELECT {_reg.select_list(_RULE_PARAM_COLS)} FROM rule_parameter "
        f"WHERE rule_id IN (SELECT rule_id FROM rule_set) ORDER BY id"
    )
    raw = cur.fetchall()
    cur.close()
    return _reg.apply_formats(_RULE_PARAM_COLS, raw)


RULE_SCEN = SectionSpec(name="Rule", cols=_RULE_COLS, custom=_rule_scen)
RULE_PARAM_SCEN = SectionSpec(name="RuleParameter", cols=_RULE_PARAM_COLS, custom=_rule_param_scen)
```

- [ ] **Step 4: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_rule_sections.py -v` → 7 passed (5 header + 2 structural).
If a header test fails, fetch the golden header (`grep -n "^------Rule(" complete/F8/6_20260612_125629/ro_input.txt`, `"^------RuleSet("`, `"^------RuleParameter("`) and align the Col list. If `class`/`store_structure`/`severity_color`/`rule_applicability` raise UndefinedColumn or actually EXIST (check `information_schema` for table `rule`), fix the db name accordingly — if `rule_applicability`/`severity_color` DO exist as columns, map them instead of None and report.

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/sections/rules.py tests/test_ro_input_rule_sections.py
git commit -m "feat(engine-server): rule sections (RuleSet, Rule, RuleParameter; scenario+ALL) (P4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.1: Cqf + CqfParameter sections

`cqf` and `cqf_parameter` are empty (data gap) → these emit 0 rows today; header validates the column contract.

**Files:** Modify `engine-server/F8/ro_input_builder/sections/rules.py`; Modify `engine-server/tests/test_ro_input_rule_sections.py`.

- [ ] **Step 1: Append the failing test**

```python
def test_cqf_header_matches_golden(conn, gold):
    assert _emit(conn, rules.CQF).columns == gold["Cqf"].columns


def test_cqf_parameter_header_matches_golden(conn, gold):
    assert _emit(conn, rules.CQF_PARAMETER).columns == gold["CqfParameter"].columns
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_rule_sections.py -k cqf -v` → FAIL (`CQF` missing).

- [ ] **Step 3: Append to `engine-server/F8/ro_input_builder/sections/rules.py`**

```python
_CQF_COLS = [
    Col("id", "id"), Col("function", "function"), Col("instance", "instance"),
    Col("cqfClass", "class"), Col("description", "description"),
    Col("reference", "reference"), Col("category", "category"),
    Col("storeStructure", "store_structure"), Col("source", "source"),
    Col("detailDisplay", "detail_display"), Col("filiale", "filiale"),
    Col("division", "division"), Col("owner", "owner"), Col("locked", "locked"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

_CQF_PARAM_COLS = [
    Col("id", "id"), Col("cqfId", "cqf_id"), Col("phaseId", "phase_id"),
    Col("paramNames", "param_names"), Col("paramValues", "param_values"),
    Col("lastModified", "updated_at"), Col("modifiedBy", "updated_by"),
]

CQF = SectionSpec(name="Cqf", table="cqf", cols=_CQF_COLS, order_by="id")
CQF_PARAMETER = SectionSpec(
    name="CqfParameter", table="cqf_parameter", cols=_CQF_PARAM_COLS, order_by="id",
)
```

> If a header test fails, align to `grep -n "^------Cqf(" complete/F8/6_20260612_125629/ro_input.txt` / `"^------CqfParameter("`. If `cqf.class`/`detail_display` raise UndefinedColumn, check `information_schema` for table `cqf` and fix the db names.

- [ ] **Step 4: Run to verify pass**

Run: `$PY -m pytest tests/test_ro_input_rule_sections.py -v` → 9 passed (7 + 2). (Cqf/CqfParameter emit 0 rows while empty — header test validates the contract.)

- [ ] **Step 5: Commit**

```bash
git add F8/ro_input_builder/sections/rules.py tests/test_ro_input_rule_sections.py
git commit -m "feat(engine-server): Cqf + CqfParameter sections (data-gap: tables empty) (P4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.2: Register P4 + version bump

**Files:** Modify `engine-server/F8/ro_input_builder/registry.py`, `cli.py`, `tests/test_ro_input_reference_sections.py`, `gantt/src/version.ts`.

- [ ] **Step 1: Append the failing CLI test** to `engine-server/tests/test_ro_input_reference_sections.py`:

```python
def test_cli_build_p4_emits_rule_sections(conn, tmp_path):
    out = tmp_path / "ro_input.txt"
    cli.build(airline="f8", scenario=6, out_path=str(out), registry_name="p4")
    text = out.read_text()
    for marker in ["------RuleSet(", "------Rule(", ")(ALL):", "------Cqf(",
                   "------CqfParameter(", "------Flight("]:
        assert marker in text
```

- [ ] **Step 2: Run to verify failure**

Run: `$PY -m pytest tests/test_ro_input_reference_sections.py -k p4 -v` → FAIL (KeyError 'p4').

- [ ] **Step 3: Add `p4_registry()` to `registry.py`** (append at end)

```python
def p4_registry() -> list[SectionSpec]:
    """P3 sections plus rule config (RuleSet, Rule scenario+ALL, RuleParameter
    scenario+ALL, Cqf, CqfParameter). Order provisional (P8 fixes it)."""
    from .sections import rules as ru
    return p3_registry() + [
        ru.RULE_SET, ru.RULE_SCEN, ru.RULE_ALL, ru.RULE_PARAM_SCEN,
        ru.RULE_PARAM_ALL, ru.CQF, ru.CQF_PARAMETER,
    ]
```

- [ ] **Step 4: Wire `"p4"` into `cli.py`** — change the registry map line to:

```python
    specs = {"p1": registry.p1_registry, "p2": registry.p2_registry,
             "p3": registry.p3_registry, "p4": registry.p4_registry}[registry_name]()
```

- [ ] **Step 5: Run to verify pass + smoke test**

```bash
$PY -m pytest tests/test_ro_input_reference_sections.py -v
$PY -m F8.ro_input_builder --airline f8 --scenario 6 --out /tmp/p4.txt --registry p4
grep -c '^------' /tmp/p4.txt                      # expect 46 (39 P3 + 7)
grep -E '^------(RuleSet|Rule|RuleParameter|Cqf|CqfParameter)\([0-9]+\)(\(ALL\))?' /tmp/p4.txt
```
Expected: tests pass; 46 sections; `Rule(14)` + `Rule(14)(ALL)` (both 14 in this under-seeded DB; golden was 14/829), `Cqf(0)`/`CqfParameter(0)` (empty tables). Counts < golden = seeding gap, expected.

- [ ] **Step 6: Bump `BACKEND_VERSION`** in `gantt/src/version.ts` (96 → 97).

- [ ] **Step 7: Commit**

```bash
cd /home/yuan.z/rois/rois-ai
git add engine-server/F8/ro_input_builder/registry.py engine-server/F8/ro_input_builder/cli.py engine-server/tests/test_ro_input_reference_sections.py gantt/src/version.ts
git commit -m "feat(engine-server): P4 registry assembly (rules) + BACKEND_VERSION 97

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria for P4

- `$PY -m pytest tests/test_ro_input_rule_sections.py tests/test_ro_input_reference_sections.py -v` → all pass.
- All 7 rule-config section headers match golden; scenario Rule == rule_set members; `--registry p4` emits 46 sections.

## Known limitations (per §No-Illusion)

- Rule tables are **under-seeded** (`rule_set`/`rule`/`rule_parameter` partial; `cqf`/`cqf_parameter` empty) → counts can't match golden. Builder + scoping logic are correct; seeding the full catalogs is a separate task. P8 optimizer run is the functional gate.
- Scenario rules are scoped by **`rule_set` membership** (the `scenario.workset_id` 9006 doesn't match `rule_set.workset_id` 103). Assumes a single active workset in `rule_set`; multi-workset seeding needs the scenario→workset linkage resolved.
- `ruleApplicability`/`severityColor` emit empty (no DB column). If those columns are later added, map them.

## Self-review

- Spec coverage: RuleSet, Rule (scenario+ALL), RuleParameter (scenario+ALL), Cqf, CqfParameter (spec §5 "Rules") ✔. Scenario scoping resolved (rule_set membership) ✔.
- Type consistency: `select_list`/`apply_formats`/`run_section`/`p3_registry`/`p4_registry` consistent ✔.
- No placeholders: full Col lists; all test bodies clean ✔.

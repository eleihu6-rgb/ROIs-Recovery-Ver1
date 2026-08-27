# Rule 7505 Unified Structured Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move rule 7505 `Bases`, `Ranks`, `Fleets`, and `Crew Teams` applicability into the shared Rust rule path used by PBS solver, Live legality, and Scenario legality.

**Architecture:** Add a Rust shared 7505 scope model that filters `DaysOffRow` by crew B/R/F/team data before the existing days-off counting kernel runs. Live/Scenario will feed structured `R/Q/T/A` lines to `check-7505`; PBS will pass scoped `days_off_rules` through PyO3 and use the same Rust scope helper before each optimizer check.

**Tech Stack:** Rust (`rule-engine-rs`), PyO3, Python PBS solver adapter (`pbs-engine/ColumnModelSolver_python`), Node live legality scripts (`live-server/scripts`), Node test runner, Vitest, pytest, cargo test.

## Global Constraints

- Do not change the 7505 days-off counting algorithm.
- Do not change 7505 parameter names in database rows.
- Do not change other rules in this phase.
- Do not remove legacy `check-7505` input compatibility in this phase.
- Preserve wildcard behavior: `*` and empty filters mean no restriction.
- Preserve Live/Scenario per-crew local RP window behavior.
- Keep implementation surgical; do not refactor unrelated rule code.
- Use TDD: each behavior change starts with a failing focused test.
- Final verification must list exact commands and pass/fail results.

---

## File Structure

- `rule-engine-rs/src/lib.rs`
  - Add shared 7505 scope structs and helpers near `DaysOffRow`.
  - Keep `check_min_days_off()` unchanged.
- `rule-engine-rs/src/bin/check_7505.rs`
  - Parse structured `R/Q/T/A` input.
  - Preserve legacy 12-column `R` parsing as wildcard scope.
- `rule-engine-rs/tests/rule_7505_tests.rs`
  - Add direct Rust tests for shared 7505 scope matching.
- `live-server/scripts/legality-recheck-core.mjs`
  - Stop JS-side 7505 B/R/F/team matching.
  - Emit structured `R/Q/T/A` for `check-7505`.
- `live-server/scripts/__tests__/legality-recheck-core.test.mjs`
  - Update 7505 tests to assert generated structured binary input.
- `live-server/scripts/check-7505-gdo.mjs`
  - Emit the same structured `check-7505` input as production recheck.
- `pbs-engine/ColumnModelSolver_python/rules/rust/rule_params.py`
  - Preserve 7505 B/R/F/team scope in `days_off_rules`.
- `rule-engine-rs/py/src/lib.rs`
  - Accept scoped 7505 rows through PyO3 and apply shared Rust scope matching in the Engine path.
- `pbs-engine/tests/unit/test_rust_checker_rule_1001_params.py` or a new focused unit test file
  - Add tests proving 7505 B/R/F/team scope is preserved by parser output.
- `pbs-engine/tests/unit/test_rust_startup.py` or a new PyO3-focused test
  - Add tests proving PBS Engine 7505 applies scoped rows to matching crew only.

---

### Task 1: Add Shared Rust 7505 Scope Model

**Files:**
- Modify: `rule-engine-rs/src/lib.rs`
- Modify: `rule-engine-rs/tests/rule_7505_tests.rs`

**Interfaces:**
- Produces:
  - `pub struct DaysOffScope { pub bases: Vec<String>, pub ranks: Vec<String>, pub fleets: Vec<String>, pub teams: Vec<String> }`
  - `pub struct CrewScope7505 { pub bases: Vec<QualEntry>, pub ranks: Vec<QualEntry>, pub fleets: Vec<QualEntry>, pub teams: Vec<QualEntry> }`
  - `pub struct ScopedDaysOffRow { pub scope: DaysOffScope, pub row: DaysOffRow }`
  - `pub fn scope_matches_7505(scope: &DaysOffScope, crew: &CrewScope7505, checked_start: i64, checked_end: i64) -> bool`
  - `pub fn filter_days_off_rows_for_crew(scoped_rows: &[ScopedDaysOffRow], crew: &CrewScope7505, checked_start: i64, checked_end: i64) -> Vec<DaysOffRow>`
- Consumes:
  - Existing `DaysOffRow`
  - Existing `QualEntry`
  - Existing 8002-style `qual_matches` semantics if reusable; otherwise implement the same wildcard/effective-date behavior locally for 7505.

- [ ] **Step 1: Write failing Rust scope tests**

Add tests to `rule-engine-rs/tests/rule_7505_tests.rs`:

```rust
use rois_rule_engine::{
    filter_days_off_rows_for_crew, CrewScope7505, DaysOffScope, QualEntry, ScopedDaysOffRow,
};

fn qual(value: &str, eff_s: i64, exp_s: i64) -> QualEntry {
    QualEntry {
        value: value.to_string(),
        eff_s,
        exp_s,
    }
}

#[test]
fn scoped_7505_row_matches_wildcard_and_or_filters() {
    let row = ScopedDaysOffRow {
        scope: DaysOffScope {
            bases: vec!["YYZ|YVR".to_string()],
            ranks: vec!["CA".to_string()],
            fleets: vec!["737".to_string()],
            teams: vec!["TEAM1".to_string()],
        },
        row: row_30(7, 0, 0),
    };
    let crew = CrewScope7505 {
        bases: vec![qual("YVR", 0, i64::MAX)],
        ranks: vec![qual("CA", 0, i64::MAX)],
        fleets: vec![qual("737", 0, i64::MAX)],
        teams: vec![qual("TEAM1", 0, i64::MAX)],
    };

    let matched = filter_days_off_rows_for_crew(&[row], &crew, 0, 86_400);

    assert_eq!(matched.len(), 1);
}

#[test]
fn scoped_7505_row_rejects_missing_nonwildcard_dimension() {
    let row = ScopedDaysOffRow {
        scope: DaysOffScope {
            bases: vec!["YYZ".to_string()],
            ranks: vec!["CA".to_string()],
            fleets: vec!["737".to_string()],
            teams: vec!["TEAM1".to_string()],
        },
        row: row_30(7, 0, 0),
    };
    let crew = CrewScope7505 {
        bases: vec![qual("YYZ", 0, i64::MAX)],
        ranks: vec![qual("FO", 0, i64::MAX)],
        fleets: vec![qual("737", 0, i64::MAX)],
        teams: vec![qual("TEAM1", 0, i64::MAX)],
    };

    let matched = filter_days_off_rows_for_crew(&[row], &crew, 0, 86_400);

    assert!(matched.is_empty());
}
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7505_tests::scoped_7505 -- --nocapture
```

Expected: FAIL because `DaysOffScope`, `CrewScope7505`, `ScopedDaysOffRow`, and `filter_days_off_rows_for_crew` do not exist.

- [ ] **Step 3: Implement minimal Rust scope model**

Add the structs and helper functions near `DaysOffRow` in `rule-engine-rs/src/lib.rs`.

Implementation requirements:

- Split pipe strings inside each filter value, so both `vec!["YYZ|YVR"]` and `vec!["YYZ", "YVR"]` work.
- Treat empty vectors, `*`, and empty strings as wildcard.
- Match case-insensitively.
- Use effective-date overlap with `[checked_start, checked_end]`.
- Use inclusive expiration matching for teams, matching current 8002 team semantics.

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7505_tests::scoped_7505 -- --nocapture
```

Expected: PASS for the new scope tests.

---

### Task 2: Extend `check-7505` CLI Structured Input

**Files:**
- Modify: `rule-engine-rs/src/bin/check_7505.rs`
- Modify: `rule-engine-rs/tests/rule_7505_tests.rs`

**Interfaces:**
- Consumes from Task 1:
  - `ScopedDaysOffRow`
  - `CrewScope7505`
  - `filter_days_off_rows_for_crew`
- Produces:
  - `check-7505` accepts structured `R/Q/T/A` rows.
  - Legacy 12-column `R` rows continue to behave as wildcard-scope rows.

- [ ] **Step 1: Write failing CLI parser behavior tests**

Add focused direct tests for the parser if extracting parser functions into `rule-engine-rs/src/lib.rs` is smaller than process-spawning a binary. The callable interface should be:

```rust
pub fn parse_check_7505_input(input: &str) -> Parsed7505Input
```

where:

```rust
pub struct Parsed7505Input {
    pub rows: Vec<ScopedDaysOffRow>,
    pub by_crew: BTreeMap<String, Vec<Activity7505>>,
    pub crew_scopes: BTreeMap<String, CrewScope7505>,
    pub skipped: usize,
}
```

Test cases:

```rust
#[test]
fn parse_check_7505_accepts_structured_scope_rows() {
    let parsed = parse_check_7505_input(
        "R\tYYZ\tCA\t737\tTEAM1\t7\t30\t30\t0\t0\tDO\t\t1\t0\t1\tRP\n\
         Q\tC1\tB\tYYZ\t0\t999999\n\
         Q\tC1\tR\tCA\t0\t999999\n\
         Q\tC1\tF\t737\t0\t999999\n\
         T\tC1\tTEAM1\t0\t999999\n\
         A\tC1\tFLY\t0\t86400\t86400\n",
    );

    assert_eq!(parsed.rows.len(), 1);
    assert_eq!(parsed.crew_scopes["C1"].teams.len(), 1);
    assert_eq!(parsed.by_crew["C1"].len(), 1);
}

#[test]
fn parse_check_7505_keeps_legacy_r_rows_as_wildcard_scope() {
    let parsed = parse_check_7505_input(
        "R\t7\t30\t30\t0\t0\tDO\t\t1\t0\t1\tRP\n\
         A\tC1\tFLY\t0\t86400\t86400\n",
    );

    assert_eq!(parsed.rows.len(), 1);
    assert!(parsed.rows[0].scope.bases.is_empty());
    assert_eq!(parsed.by_crew["C1"].len(), 1);
}
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml parse_check_7505 -- --nocapture
```

Expected: FAIL because `parse_check_7505_input` does not exist.

- [ ] **Step 3: Implement parser and CLI evaluation**

Implementation requirements:

- Move reusable parsing into `rule-engine-rs/src/lib.rs` next to 7505 types.
- `check_7505.rs` should call `parse_check_7505_input(&input)`.
- For each crew:
  - Build the crew scope from parsed `Q` and `T` rows.
  - Filter scoped rule rows through `filter_days_off_rows_for_crew`.
  - If no matched rows, skip that crew.
  - Call `check_min_days_off(crew, acts, rp_start, rp_end, offset, &matched_rows)`.
- `T crew team` without dates means `eff=0`, `exp=i64::MAX`.

- [ ] **Step 4: Run Rust 7505 tests**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7505 -- --nocapture
cargo test --manifest-path rule-engine-rs/Cargo.toml parse_check_7505 -- --nocapture
```

Expected: PASS.

- [ ] **Step 5: Build/check CLI**

Run:

```bash
cargo build --manifest-path rule-engine-rs/Cargo.toml --bin check-7505
```

Expected: PASS.

---

### Task 3: Migrate Live/Scenario `rule7505()` to Structured Binary Input

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs`
- Modify: `live-server/scripts/__tests__/legality-recheck-core.test.mjs`

**Interfaces:**
- Consumes:
  - Structured `check-7505` input from Task 2.
- Produces:
  - `rule7505()` emits `R/Q/T/A` lines and no longer does JS-side B/R/F/team matching.

- [ ] **Step 1: Update tests to expect structured binary input**

In `live-server/scripts/__tests__/legality-recheck-core.test.mjs`, add or update a 7505 test that captures `ctx.runBin` input:

```javascript
test('rule7505 emits structured scope rows for check-7505', async () => {
  let captured
  const source = {
    async crewOffsets() { return new Map([['C1', -360]]) },
    async crewQualEntries() {
      return [
        { crew_id: 'C1', dim: 'B', value: 'YYZ', eff: '2026-01-01', exp: '2026-12-31' },
        { crew_id: 'C1', dim: 'R', value: 'CA', eff: '2026-01-01', exp: '2026-12-31' },
        { crew_id: 'C1', dim: 'F', value: '737', eff: '2026-01-01', exp: '2026-12-31' },
      ]
    },
    async crewTeams() { return new Map([['C1', ['TEAM1']]]) },
    async assignmentsAll() {
      return [{
        crew_id: 'C1',
        pairing_id: 101,
        code: 'FLY',
        s: epoch('2026-06-01T06:00:00Z'),
        e: epoch('2026-07-01T06:00:00Z'),
        end_rest_secs: epoch('2026-07-01T06:00:00Z'),
      }]
    },
  }

  await rule7505(source, {
    ...CTX_DATES,
    instancesOf: (fn) => fn === 7505
      ? [{ instance: '002', header: HDR7505, rows: [['YYZ', 'CA', '737', 'TEAM1', 'DO', '7', '1', 'RP', '30-30', 'N', 'N', 'N', '*', '0-0']] }]
      : [],
    log: () => {},
    runBin(bin, args, tsv) {
      captured = { bin, args, tsv }
      return []
    },
  })

  assert.equal(captured.bin, 'check-7505')
  assert.match(captured.tsv, /^R\tYYZ\tCA\t737\tTEAM1\t7\t30\t30\t0\t0\tDO\t\t0\t0\t1\tRP$/m)
  assert.match(captured.tsv, /^Q\tC1\tB\tYYZ\t20454\t20818$/m)
  assert.match(captured.tsv, /^Q\tC1\tR\tCA\t20454\t20818$/m)
  assert.match(captured.tsv, /^Q\tC1\tF\t737\t20454\t20818$/m)
  assert.match(captured.tsv, /^T\tC1\tTEAM1$/m)
  assert.match(captured.tsv, /^A\tC1\tFLY\t/m)
})
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node live-server/scripts/__tests__/legality-recheck-core.test.mjs
```

Expected: FAIL because `rule7505()` still emits legacy `R` rows and pre-filters in JS.

- [ ] **Step 3: Implement structured input emission**

Implementation requirements in `rule7505()`:

- Keep validation for required `Min DO` and `RP Days Range`.
- Build `R` lines as:

```javascript
[
  'R',
  bases,
  ranks,
  fleets,
  teams,
  String(Number(r[iMin])),
  rpLo,
  rpHi,
  lvLo,
  lvHi,
  'DO',
  leaveCodes,
  r[iBlank] === 'Y' ? '1' : '0',
  r[iPostRest] === 'Y' ? '1' : '0',
  r[iPeriod],
  r[iUnit],
].join('\t')
```

- Build `Q` lines only when at least one valid row needs B/R/F.
- Build `T` lines only when at least one valid row needs team data.
- Remove JS-side `crewRules = rules.filter(...)` B/R/F/team matching.
- Still invoke per crew, but pass the same structured `R/Q/T` lines plus that crew's `A` lines.

- [ ] **Step 4: Run focused Live tests**

Run:

```bash
node live-server/scripts/__tests__/legality-recheck-core.test.mjs
npm --prefix live-server test -- src/__tests__/services/scenario-seed-legality-source.test.ts tests/unit/legality-recheck-core-param.spec.ts --run
node --check live-server/scripts/legality-recheck-core.mjs
```

Expected: PASS.

---

### Task 4: Migrate `check-7505-gdo.mjs` Diagnostic Harness

**Files:**
- Modify: `live-server/scripts/check-7505-gdo.mjs`
- Modify: `live-server/scripts/__tests__/check-7505-gdo.test.mjs`

**Interfaces:**
- Consumes:
  - Structured `check-7505` input from Task 2.
- Produces:
  - Diagnostic harness uses the same `R/Q/T/A` protocol as production recheck.

- [ ] **Step 1: Add/adjust harness test**

Add a test that asserts generated rule lines include B/R/F/team columns when param rows include them. If the current harness does not expose a builder function, extract one:

```javascript
export function buildStructured7505RuleLine(row, H) {
  return [
    'R',
    fieldOrStar(row, H, 'Bases'),
    fieldOrStar(row, H, 'Ranks'),
    fieldOrStar(row, H, 'Fleets'),
    fieldOrStar(row, H, 'Crew Teams'),
    String(Number(row[H('Min DO')])),
    ...String(row[H('RP Days Range')]).split('-'),
    ...String(row[H('Leave Days Range')] ?? '0-0').split('-'),
    'DO',
    row[H('Leave Assignments')] === '*' ? '' : String(row[H('Leave Assignments')] ?? '').split('|').join(','),
    row[H('Count Blank Day')] === 'Y' ? '1' : '0',
    row[H('Utilize Post Duty Rest')] === 'Y' ? '1' : '0',
    row[H('Period')],
    row[H('Unit')],
  ].join('\t')
}
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node live-server/scripts/__tests__/check-7505-gdo.test.mjs
```

Expected: FAIL until the harness emits structured rows.

- [ ] **Step 3: Implement harness structured input**

Implementation requirements:

- Emit structured `R` rows.
- Query and emit `Q` rows when non-wildcard B/R/F exists.
- Query and emit `T` rows when non-wildcard `Crew Teams` exists.
- Preserve current persist output parsing.

- [ ] **Step 4: Run harness tests**

Run:

```bash
node live-server/scripts/__tests__/check-7505-gdo.test.mjs
node --check live-server/scripts/check-7505-gdo.mjs
```

Expected: PASS.

---

### Task 5: Migrate PBS Solver PyO3 7505 Scope

**Files:**
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/rule_params.py`
- Modify: `rule-engine-rs/py/src/lib.rs`
- Modify: `pbs-engine/tests/unit/test_rust_checker_rule_1001_params.py` or create `pbs-engine/tests/unit/test_rust_checker_rule_7505_scope.py`
- Modify: an existing PyO3 Engine test file or add a focused test under `rule-engine-rs/tests` if PyO3 tests are local to Rust.

**Interfaces:**
- Consumes:
  - `ScopedDaysOffRow`, `DaysOffScope`, `CrewScope7505`, `filter_days_off_rows_for_crew`
- Produces:
  - Python `days_off_rules` preserves `(bases, ranks, fleets, teams)` plus days-off row values.
  - PyO3 `Engine` applies scoped 7505 rows with the same Rust helper used by CLI.

- [ ] **Step 1: Write parser test for PBS `days_off_rules` scope**

Add a focused Python test:

```python
def test_extract_rule_params_preserves_7505_scope_fields() -> None:
    sections = _sections_with_7505_row(
        header="Bases,Ranks,Fleets,Crew Teams,DO Assignment Group,Min DO,Period,Unit,RP Days Range,Utilize Post Duty Rest,Count Blank Day,Count Layover,Leave Assignments,Leave Days Range",
        row="YYZ,CA,737,TEAM1,DO,7,1,RP,30-30,N,N,N,*,0-0",
    )

    params = extract_rule_params(sections, rp_start=date(2026, 6, 1), rp_end=date(2026, 6, 30))

    assert params["days_off_rules"][0][0] == (["YYZ"], ["CA"], ["737"], ["TEAM1"])
```

- [ ] **Step 2: Run parser test to verify RED**

Run:

```bash
pytest pbs-engine/tests/unit/test_rust_checker_rule_7505_scope.py -q
```

Expected: FAIL because `days_off_rules` currently does not preserve scope in the target shape.

- [ ] **Step 3: Update Python parser shape**

Change `rule_params.py` so each 7505 row becomes:

```python
(
    (
        _pipe_list(_value_at(values, base_i)),
        _pipe_list(_value_at(values, rank_i)),
        _pipe_list(_value_at(values, fleet_i)),
        _pipe_list(_value_at(values, team_i)),
    ),
    (
        min_do,
        rp_range[0],
        rp_range[1],
        leave_range[0],
        leave_range[1],
        ["DO"],
        _pipe_list(_value_at(values, leave_i)),
        _value_at(values, blank_i).upper() == "Y",
        _value_at(values, layover_i).upper() == "Y",
        _value_at(values, post_rest_i).upper() == "Y",
        _value_at(values, period_i),
        _value_at(values, unit_i),
    ),
)
```

- [ ] **Step 4: Update PyO3 Engine parameter parsing**

Update `rule-engine-rs/py/src/lib.rs` so `days_off_rules` accepts the scoped tuple shape.

Implementation requirements:

- Preserve backward compatibility with existing unscoped `days_off_rules` if currently used by tests.
- Convert each scoped row into `ScopedDaysOffRow`.
- In `check_7505`, build `CrewScope7505` for the crew from:
  - `crew_base_quals`
  - `crew_rank_quals`
  - `crew_fleet_quals`
  - `crew_teams`
- Filter scoped rows with `filter_days_off_rows_for_crew`.
- Pass only matched `DaysOffRow` values to the existing `check_min_days_off_app`.

- [ ] **Step 5: Run PBS and PyO3 focused tests**

Run:

```bash
pytest pbs-engine/tests/unit/test_rust_checker_rule_7505_scope.py -q
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7505 -- --nocapture
```

Expected: PASS.

---

### Task 6: Final Cross-Path Verification

**Files:**
- No new implementation files unless previous task failures expose stale tests.

**Interfaces:**
- Consumes all tasks.
- Produces final confidence that Live, Scenario, PBS, CLI, and Rust shared model agree.

- [ ] **Step 1: Run Rust verification**

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7505 -- --nocapture
cargo build --manifest-path rule-engine-rs/Cargo.toml --bin check-7505
```

Expected: PASS.

- [ ] **Step 2: Run Live-server verification**

```bash
node live-server/scripts/__tests__/legality-recheck-core.test.mjs
node live-server/scripts/__tests__/check-7505-gdo.test.mjs
npm --prefix live-server test -- src/__tests__/services/scenario-seed-legality-source.test.ts tests/unit/legality-recheck-core-param.spec.ts --run
node --check live-server/scripts/legality-recheck-core.mjs
node --check live-server/scripts/live-legality.mjs
node --check live-server/scripts/scenario-legality.mjs
node --check live-server/scripts/scenario-legality-source.mjs
node --check live-server/scripts/check-7505-gdo.mjs
```

Expected: PASS.

- [ ] **Step 3: Run PBS verification**

```bash
pytest pbs-engine/tests/unit/test_rust_checker_rule_7505_scope.py -q
```

Expected: PASS.

- [ ] **Step 4: Check worktree and submodules**

```bash
git status --short --branch
git -C pbs-engine status --short --branch
git -C rule-engine-rs status --short --branch
git diff --check
```

Expected:

- Root repo contains only expected docs and live-server changes.
- `pbs-engine` and `rule-engine-rs` contain only expected committed or staged submodule changes for this task.
- `git diff --check` exits 0.

---

## Self-Review

Spec coverage:

- Rust shared scope model: Task 1.
- `check-7505` structured input plus legacy compatibility: Task 2.
- Live/Scenario migration: Task 3.
- Diagnostic harness migration: Task 4.
- PBS PyO3 migration: Task 5.
- Cross-path verification: Task 6.

Placeholder scan:

- No `TBD`, `TODO`, or deferred requirements remain.
- Each task has explicit files, interfaces, tests, and commands.

Type consistency:

- `DaysOffScope`, `CrewScope7505`, `ScopedDaysOffRow`, and `filter_days_off_rows_for_crew` are named consistently across Rust CLI, PyO3, and tests.
- Structured CLI contract matches the spec: `R bases ranks fleets teams min_do rp_lo rp_hi leave_lo leave_hi do_codes leave_codes count_blank count_post_rest period unit`.

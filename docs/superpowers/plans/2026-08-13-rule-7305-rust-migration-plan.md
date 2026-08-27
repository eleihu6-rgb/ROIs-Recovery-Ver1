# Rule 7305 Rust Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port C++ rule 7305 into the shared Rust legality engine and wire the same semantics into PBS Solver, Live Gantt, and Scenario Gantt, with `CREW TEAMS` parameter naming and idempotent SIT database configuration.

**Architecture:** Implement one dependency-free `rule7305` kernel in `rule-engine-rs/src/rules/rule7305.rs`. PBS calls it in-process through the PyO3 `Engine`; Live and Scenario call it through a shared `check-7305` TSV binary from `legality-recheck-core.mjs`. Live/Scenario source adapters provide the same normalized qualification and roster contract, while the adapters remain responsible for their respective database schemas.

**Tech Stack:** Rust 2021, Cargo, PyO3/maturin, Python 3.12, Node.js ESM tests with `node:test`, PostgreSQL SQL migrations, Playwright.

## Global Constraints

- Preserve the C++ 15-position rule row layout; position 5 is serialized as `CREW TEAMS`, while readers accept both `CREW TEAMS` and legacy `TEAMS`.
- Symbolic defaults are `*`; numeric defaults are `0`; numeric `0` must remain a real numeric value.
- Preserve C++ matching, effective-date, phase-reset, T/D continuity, strict `actual > max`, UTC span, and message semantics.
- Use `Application::Editor` for Live/Scenario behavior and `Application::Optimizer` for PBS behavior.
- Optimizer ignores violations formed only by pre-assigned rows and reports violations in which a candidate row participates.
- Live and Scenario must use one shared rule function and one Rust kernel; only source adapters may differ.
- Do not modify `sql/schema/**.sql`, legacy `ro-engine`, or legacy `po-engine`.
- Business-data SQL validation must use the remote authority specified by the project guide; never use local f8 business data as the authority.
- Do not write credentials, tokens, or connection strings into tracked files.
- Do not add dependencies unless license, source, activity, and vulnerability requirements are verified.
- Do not automatically run `git commit` or `git push`; the repository explicitly forbids auto-commit.
- GitNexus MCP is unavailable; before changing existing symbols, inspect their callers and touched tests explicitly and record the limitation in the final report.

---

## Files And Responsibilities

Create:

- `rule-engine-rs/src/rules/rule7305.rs` — shared typed rule model, matching helpers, T/D continuity kernel, application filtering, and violation types.
- `rule-engine-rs/src/bin/check_7305.rs` — structured TSV parser/formatter for Live and Scenario.
- `rule-engine-rs/tests/rule_7305_tests.rs` — kernel-level C++ parity tests.
- `rule-engine-rs/tests/rule_7305_binary_tests.rs` — binary contract tests when the existing CLI test pattern supports process execution.
- `sql/migration/2026-08-13-rule-7305-add-f8-ruleset.sql` — idempotent SIT/live rule migration.
- `sql/migration/verify/2026-08-13-rule-7305-add-f8-ruleset-verify.sql` — read-only migration verification query.
- `pbs-engine/ColumnModelSolver_python/rules/rust/tests/test_rule_7305_params.py` — PBS parameter and position extraction tests if no existing focused module test is suitable.
- `live-server/scripts/__tests__/rule-7305.test.mjs` — shared legality-core 7305 adapter and output-mapping tests if keeping 7305 tests separate improves file size.

Modify:

- `rule-engine-rs/src/rules/mod.rs`
- `rule-engine-rs/src/lib.rs`
- `rule-engine-rs/Cargo.toml`
- `rule-engine-rs/py/src/lib.rs`
- `pbs-engine/ColumnModelSolver_python/rules/rust/engine_builder.py`
- `pbs-engine/ColumnModelSolver_python/rules/rust/rule_params.py`
- `pbs-engine/ColumnModelSolver_python/rules/rust/rule_gates.py`
- `live-server/scripts/rust-bins.json`
- `live-server/scripts/legality-recheck-core.mjs`
- `live-server/scripts/live-legality.mjs`
- `live-server/scripts/scenario-legality.mjs`
- `live-server/scripts/scenario-legality-source.mjs`
- `live-server/scripts/__tests__/legality-recheck-core.test.mjs`
- relevant PBS unit tests under `pbs-engine/tests/unit/`
- relevant Playwright specs under `e2e/tests/gantt/`
- `sql/seed/07-rule.sql` only if the repository seed is required to keep fresh-airline provisioning aligned with the migration

---

### Task 1: Lock Down C++ Parity With Failing Rust Tests

**Files:**

- Create: `rule-engine-rs/tests/rule_7305_tests.rs`
- Read-only reference: `crewrule-dev/RuleEngine/rule/rule7305/LimitMaxConsecutiveDutyTimesForPRRule.cpp`
- Read-only reference: `crewrule-dev/RuleEngine/rule/rule7305/LimitMaxConsecutiveDutyTimesForPRRuleParam.cpp`
- Read-only reference: `crewrule-dev/RuleEngine/rule/framework/utils/RosterUtils.cpp`
- Read-only reference: `crewrule-dev/RuleEngine/rule/framework/utils/TimeUtils.cpp`

**Interfaces:**

- The tests define the public Rust types that Task 2 must provide:
  - `Rule7305::from_cells(&[&str]) -> Result<Rule7305, String>`
  - `Rule7305Duty`
  - `Rule7305CrewContext`
  - `check_rule7305_row(crew_id, rule, duties, crew_context, checked_start, checked_end, application) -> Vec<Rule7305Violation>`
  - `Application::{Editor, Optimizer}`

- [ ] **Step 1: Add test fixtures and the failing API imports**

Use a fixed UTC fixture with a crew local offset of `-360` minutes. Each duty must include start UTC, duty end UTC, rest end UTC, assignment, assignment group, attributes, label, PA flag, and phase-checked flag. Add tests for:

```rust
use rois_rule_engine::rules::rule7305::{
    check_rule7305_row, Rule7305, Rule7305CrewContext, Rule7305Duty,
};
use rois_rule_engine::Application;

fn duty(
    id: i64,
    start: i64,
    duty_end: i64,
    rest_end: i64,
    assignment: &str,
    group: &str,
    attributes: &str,
    label: &str,
    pre_assigned: bool,
) -> Rule7305Duty {
    Rule7305Duty {
        activity_id: id,
        pairing_id: if id > 0 { Some(id) } else { None },
        start_utc: start,
        duty_end_utc: duty_end,
        rest_end_utc: rest_end,
        local_offset_min: -360,
        assignment: assignment.to_string(),
        assignment_group: group.to_string(),
        attributes: attributes.split('|').map(str::to_string).collect(),
        label: label.to_string(),
        pre_assigned,
        phase_checked: true,
    }
}
```

Cover these assertions:

- `T` first duty gives actual `1`.
- `T` same-local-day and next-local-day rest/start boundaries continue.
- A larger gap resets the run and only a later run can violate.
- `D` first duty contributes inclusive local calendar days.
- `D` same-local-day continuation contributes current span minus one.
- `D` next-local-day continuation contributes current span.
- `actual == max` is legal; `actual == max + 1` violates.
- assignment, assignment group, attribute, and label filters work independently.
- ground activities can match attributes but cannot match a non-wildcard label.
- `*` and empty symbolic fields wildcard.
- base, rank, position, fleet, and team qualification filters are effective-date-aware.
- phase-skipped and nonmatching duties reset continuity.
- Editor emits a PA-only breach.
- Optimizer suppresses a PA-only breach and emits a mixed PA/candidate breach.
- violation start/end and exact C++ message are preserved.

- [ ] **Step 2: Add parser tests for the exact 15-column layout**

Use this row shape:

```rust
let rule = Rule7305::from_cells(&[
    "*", "*", "*", "*", "TEAM-A", "FLY", "FLT", "LABEL-A", "ATTR-A",
    "", "", "D", "", "3", "1",
]).unwrap();
assert_eq!(rule.teams, vec!["TEAM-A"]);
assert_eq!(rule.assignment_groups, vec!["FLY"]);
assert_eq!(rule.assignments, vec!["FLT"]);
assert_eq!(rule.consecutive_type, Rule7305ConsecutiveType::Days);
assert_eq!(rule.max_consecutive, 3);
assert_eq!(rule.severity, 1);
```

Also test `from_cells` rejects fewer than 15 cells, invalid type, and nonnumeric max/severity with a field-specific error.

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7305 -- --nocapture
```

Expected: compilation failure because the 7305 module and public types do not yet exist.

---

### Task 2: Implement The Shared Rust 7305 Kernel

**Files:**

- Create: `rule-engine-rs/src/rules/rule7305.rs`
- Modify: `rule-engine-rs/src/rules/mod.rs`
- Modify: `rule-engine-rs/src/lib.rs`
- Test: `rule-engine-rs/tests/rule_7305_tests.rs`

**Interfaces:**

- `Rule7305` stores the 15 positional fields:

```rust
pub struct Rule7305 {
    pub bases: Vec<String>,
    pub ranks: Vec<String>,
    pub positions: Vec<String>,
    pub fleets: Vec<String>,
    pub teams: Vec<String>,
    pub assignment_groups: Vec<String>,
    pub assignments: Vec<String>,
    pub labels: Vec<String>,
    pub attributes: Vec<String>,
    pub consecutive_type: Rule7305ConsecutiveType,
    pub max_consecutive: i64,
    pub severity: i32,
}
```

- `Rule7305Duty` and `Rule7305CrewContext` are normalized, caller-independent inputs.
- `Rule7305Violation` contains `crew_id`, triggering activity/pairing, UTC span, actual, limit, severity, and message.
- `check_rule7305_row` is the only shared calculation entry point used by PyO3 and the binary.

- [ ] **Step 1: Implement fixed-position parsing**

Parse cells by index, not by a map:

```rust
const RULE7305_CELL_COUNT: usize = 15;
const TYPE_INDEX: usize = 11;
const MAX_INDEX: usize = 13;
const SEVERITY_INDEX: usize = 14;
```

Treat empty and `*` symbolic cells as wildcard vectors containing `*`. Split non-wildcards on `|`, trim values, reject empty results after a non-wildcard input, and preserve compatibility cells 10, 11, and 13 internally or explicitly ignore them only after validating the 15-cell shape.

- [ ] **Step 2: Implement effective-dated qualification matching**

Implement one helper per dimension using the existing `(value, eff_ord, exp_ord)` convention. A qualification matches when its value matches a requested filter and its effective window overlaps the checked interval. Position qualifications use the same tuple shape but are held in their own context vector. Team values are active for the entire supplied context unless the caller provides effective team dates.

Fail closed when a non-wildcard qualification filter has no corresponding context data. Treat missing optional qualification collections as empty, never as wildcard.

- [ ] **Step 3: Implement roster matching**

Match:

```text
assignment        -> duty.assignment
assignment group  -> assignment-group membership callback/context
attributes        -> any duty attribute
labels            -> duty.label, false for ground duty when labels are non-wildcard
```

Use case-insensitive comparison only where existing Rust rule helpers already do so; otherwise preserve C++ exact-value behavior. Assignment-group membership must be represented by a context callback or normalized mapping, not duplicated in each caller.

- [ ] **Step 4: Implement T/D continuity exactly**

Sort duties by start UTC and stable activity ID before evaluating. On a phase-skipped or nonmatching duty, flush the current run. For each matching duty:

```text
T:
  first matching duty = 1
  later duty = 1 when previous rest local day and current start local day differ by 0 or 1

D:
  first matching duty = inclusive local calendar span
  same local day after previous rest = current inclusive span - 1
  next local day after previous rest = current inclusive span
  other gap = reset
```

Use epoch-day conversion with floor division after applying the duty’s local offset. Emit a violation only after the run is flushed and `actual > max_consecutive`, using the first matching start and last matching rest end.

- [ ] **Step 5: Implement Editor/Optimizer filtering**

`Editor` returns all violations. `Optimizer` returns a violation only if at least one duty in the violating run has `pre_assigned == false`. Keep the actual span and triggering activity from the full run.

- [ ] **Step 6: Match C++ messages and test output**

Use the exact messages from the spec and populate `actual`, `limit`, `severity`, and `pairing_id`. Export the module through `rules/mod.rs` and any root re-export convention in `src/lib.rs`.

- [ ] **Step 7: Run the focused Rust tests**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7305 -- --nocapture
```

Expected: PASS for all 7305 parser, matching, continuity, application, message, and span tests.

---

### Task 3: Add And Test The `check-7305` Batch Binary

**Files:**

- Create: `rule-engine-rs/src/bin/check_7305.rs`
- Modify: `rule-engine-rs/Cargo.toml`
- Modify: `live-server/scripts/rust-bins.json`
- Create/modify: `rule-engine-rs/tests/rule_7305_binary_tests.rs`

**Interfaces:**

Input TSV:

```text
C   checked_start_utc   checked_end_utc   application
R   row_index   15 rule cells
Q   crew_id   B|R|F|P   value   eff_ord   exp_ord
T   crew_id   team
D   crew_id   activity_id   pairing_id   start_utc   duty_end_utc   rest_end_utc
    local_offset_min   assignment   assignment_group   attributes   label
    pre_assigned   phase_checked   is_ground
G   assignment   assignment_group
```

Output TSV:

```text
V   crew_id   row_index   pairing_id   start_utc   end_utc   actual   limit   severity   message
```

- [ ] **Step 1: Add the binary manifest and binary freshness registration**

Add:

```toml
[[bin]]
name = "check-7305"
path = "src/bin/check_7305.rs"
```

Add `"check-7305"` to `live-server/scripts/rust-bins.json`.

- [ ] **Step 2: Implement strict tagged TSV parsing**

Reject malformed required rows with a nonzero process exit and an error naming the tag and field. Preserve tabs/newlines inside free-text fields by using the existing `cleanTsv` contract at the JavaScript boundary; the binary must still reject an insufficient column count.

Build a `BTreeMap<String, Rule7305CrewContext>` and `BTreeMap<String, Vec<Rule7305Duty>>`, parse `Q` dimension `P` into position qualifications, and parse `G` into assignment-group membership.

- [ ] **Step 3: Evaluate every crew × rule row with `Application`**

Use the shared `check_rule7305_row` function. Sort duties before evaluation and sort output deterministically by crew, row index, and start UTC.

- [ ] **Step 4: Add process-level contract tests**

Feed a small TSV fixture to the compiled binary and assert one `V` row, its actual/limit, pairing ID, and exact message. Add a malformed `R` and malformed `D` case that exits nonzero.

- [ ] **Step 5: Build and run the binary tests**

Run:

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7305_binary -- --nocapture
cargo build --release --manifest-path rule-engine-rs/Cargo.toml --bin check-7305
```

Expected: PASS and a fresh executable at `rule-engine-rs/target/release/check-7305`.

---

### Task 4: Wire 7305 Into The PyO3 Connector

**Files:**

- Modify: `rule-engine-rs/py/src/lib.rs`
- Modify: `rule-engine-rs/src/rules/rule7305.rs` only if a shared adapter type is needed
- Test: `rule-engine-rs/py/tests/` existing connector tests or create the focused test named by the repository’s current PyO3 test convention

**Interfaces:**

- Add constructor arguments:

```text
rule7305_rows: Vec<Vec<String>>
crew_position_quals: Vec<Vec<(String, i64, i64)>>
assignment_group_map: Vec<(String, String)>
```

- Store parsed `Vec<Rule7305>` and position qualification windows in `Engine`.
- Invoke `check_rule7305` from `check_line` when `is_enabled("7305")`.
- Emit machine-readable strings using the existing rule prefix convention, for example:

```text
7305|pairing=<id>|actual=<actual>|limit=<limit>|start_s=<start>|end_s=<end>
```

- [ ] **Step 1: Add constructor validation tests before implementation**

Test:

```python
engine = rois_rule_engine_rs.Engine(
    pairing_start_utc=[0],
    pairing_end_utc=[3600],
    pairing_blk_min=[0],
    crew_fixed_pairings=[[]],
    rule7305_rows=[["*", "*", "*", "*", "*", "*", "*", "*", "*", "", "", "T", "", "0", "1"]],
    crew_position_quals=[[("CA", 0, -1)]],
    enabled_functions=["7305"],
)
assert engine.check_line(0, []) == []
```

Also assert incorrect row length and position-qualification crew length return `PyValueError`.

- [ ] **Step 2: Add 7305 fields and parse fixed rows**

Use the fixed 15-cell parser from the shared kernel. Do not convert the row into a `HashMap`; this protects compatibility positions and numeric `0`.

- [ ] **Step 3: Add position qualification propagation**

Keep existing `crew_rank_quals` and `crew_fleet_quals` tuple contracts unchanged. Add a parallel `crew_position_quals` array validated against crew count.

- [ ] **Step 4: Add assignment-group membership context**

Reuse the existing assignment-group mapping utility if one exists. If the Engine currently receives only grouped spacing data, add one normalized mapping argument and use it for 7305 only; do not copy a hardcoded assignment catalog into Rust.

- [ ] **Step 5: Invoke the shared kernel from `check_line`**

Construct fixed and candidate duties from pairings and ground duties. Preserve PA flags. Use the current scenario/check window for qualification matching in Optimizer mode and the line window for Editor mode.

- [ ] **Step 6: Run connector tests**

After building the extension with the repository’s existing maturin command, run the focused PyO3 test. Expected coverage: gating, row validation, position qualification, PA-only tolerance, candidate participation, and exact output prefix.

---

### Task 5: Wire PBS Parameter Extraction And Add Position Data

**Files:**

- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/rule_params.py`
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/engine_builder.py`
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/rule_gates.py`
- Test: `pbs-engine/ColumnModelSolver_python/rules/rust/tests/test_rule_7305_params.py`
- Test: relevant `pbs-engine/tests/unit/` rule gate/builder tests

**Interfaces:**

- `extract_rule_params()` returns:

```python
params["rule7305_rows"]: list[list[str]]
```

Each row is exactly 15 cells, read by position. The helper accepts `CREW TEAMS` and `TEAMS` headers without changing the serialized cell order.

- `engine_builder.build_engine()` passes:

```python
rule7305_rows=params["rule7305_rows"]
crew_position_quals=position_qualifications
assignment_group_map=assignment_group_map
```

- [ ] **Step 1: Write parameter extraction tests**

Cover:

```python
header = [
    "Bases", "Ranks", "Positions", "Fleets", "CREW TEAMS",
    "Assignment Groups", "Assignments", "Labels", "Attributes",
    "Unused 1", "Unused 2", "Consecutive Type (T/D)",
    "Unused 3", "Max Consecutive Times", "Severity",
]
row = ["*", "CA", "CAPT", "*", "TEAM-A", "FLY", "FLT", "*", "*", "", "", "D", "", "0", "1"]
```

Assert the extracted row is exactly 15 cells, `TEAMS` produces the same result, and `"0"` survives at max/severity positions. Assert invalid row lengths are rejected under the configured unsupported-rule policy.

- [ ] **Step 2: Add the 7305 extraction branch**

Use `_param_rows_with_sources(sections, "7305")`, locate headers only to support old/new team naming, and normalize absent symbolic cells to `*` and absent numeric cells to `0`. Preserve all 15 positions in the output list.

- [ ] **Step 3: Extract CrewRank.position**

Add `_extract_crew_positions()` using the same date ordinal rules as `_extract_crew_quals()`. Read `position`, `crewPosition`, or the exact ro_input field available in the source sections after confirming it from the fixture. Do not overwrite rank qualification values.

- [ ] **Step 4: Pass data through the builder**

Update the return tuple from `_build_crew_arrays()` only if needed; prefer a separate position array to minimize existing tuple churn. Add the new constructor arguments and preserve array length validation.

- [ ] **Step 5: Gate the PBS rule**

Add `"7305"` to `_PYO3_WIRED_FUNCTIONS` so active rulesets can enable it and inactive rules remain skipped.

- [ ] **Step 6: Run focused PBS tests**

Run the existing targeted Python tests plus the new file. Expected: `CREW TEAMS` and `TEAMS` both parse, numeric zero remains present, Position rows reach the builder, and enabled-function plans contain `7305`.

---

### Task 6: Add Shared Live/Scenario Source Contract And Rule Function

**Files:**

- Modify: `live-server/scripts/legality-recheck-core.mjs`
- Modify: `live-server/scripts/live-legality.mjs`
- Modify: `live-server/scripts/scenario-legality.mjs`
- Modify: `live-server/scripts/scenario-legality-source.mjs`
- Modify/create: `live-server/scripts/__tests__/legality-recheck-core.test.mjs`

**Interfaces:**

- Add optional source adapter method:

```javascript
async crewPositionQualEntries() {
  return [{ crew_id, value, eff, exp }]
}
```

- Add shared export:

```javascript
export async function rule7305(source, ctx)
```

- Add `rule7305` to `RULES`.

- [ ] **Step 1: Add shared source adapter tests with a fake adapter**

Use `ctx.instancesOf(7305)` with a 15-cell header and two duties. Capture `ctx.runBin` input and assert:

```text
R  <row-index>  <15 cells>
Q  C1  P  CA  <eff-ord>  <exp-ord>
D  C1  <activity>  <pairing>  <start>  <duty-end>  <rest-end> ...
```

Assert missing instances return `[]` without calling the binary. Assert `CREW TEAMS` and legacy `TEAMS` headers resolve the same column.

- [ ] **Step 2: Add `crewPositionQualEntries()` to Live**

Query the live authority’s crew rank/position source using the existing date fields and crew filtering. Return only effective-dated position rows in the shared shape.

- [ ] **Step 3: Add the same method to Scenario**

Use scenario roster crew IDs but the shared F8 qualification source, matching the existing Scenario `crewQualEntries()` pattern. Do not duplicate Live SQL in the core.

- [ ] **Step 4: Implement `rule7305()` input construction**

For each valid row:

- validate 15 cells and parse type/max/severity;
- collect required crew IDs and qualification dimensions;
- load all assignment/ground activities for the checked window;
- include pairing attributes, labels, assignments, assignment groups, rest end, local offset, PA flag, and phase state;
- emit assignment-group mapping records using the source adapter’s existing mapping accessor;
- invoke `check-7305 --emit-tsv --editor`;
- map `V` rows to `rule_code: '7305'`, resolved instance, row scope key, anchor pairing, ISO UTC span, actual, limit, severity, and exact message.

Do not hardcode a severity in the rule function; `applyRulesetSeverity` must remain the final catalog overlay.

- [ ] **Step 5: Keep first paint asynchronous**

Use the existing recheck execution path. Do not add 7305 to any initial Gantt data query or synchronous first-paint path. The rule function may load only the crew/activity set already selected by the recheck context.

- [ ] **Step 6: Run shared Node tests**

Run:

```bash
node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs
```

Expected: PASS for no-instance skip, header compatibility, T/D input, qualification/teams/position rows, output mapping, and adapter parity.

---

### Task 7: Add Database Migration, Seed Alignment, And Remote Verification

**Files:**

- Create: `sql/migration/2026-08-13-rule-7305-add-f8-ruleset.sql`
- Create: `sql/migration/verify/2026-08-13-rule-7305-add-f8-ruleset-verify.sql`
- Modify: `sql/seed/07-rule.sql` only if fresh-airline seed parity is required

**Interfaces:**

- Rule identity: `7305001`.
- Function: `7305`.
- Instance: `'001'`.
- Header positions:

```text
Bases
Ranks
Positions
Fleets
CREW TEAMS
Assignment Groups
Assignments
Labels
Attributes
Unused 1
Unused 2
Consecutive Type (T/D)
Unused 3
Max Consecutive Times
Severity
```

- Default row:

```text
["*", "*", "*", "*", "*", "*", "*", "*", "*", "", "", "T", "", "0", "0"]
```

- [ ] **Step 1: Inspect nearby metadata before writing SQL**

Use nearby 7503/7504/7505/8056 metadata and the C++ rule registration to select description, class, reference, category, store structure, source, detail, overridability, division, owner, and lock values. The migration must not invent a new metadata convention.

- [ ] **Step 2: Write an idempotent insert/update migration**

Follow the existing 7507 migration pattern:

- insert rule if absent;
- update the complete 7305 metadata and `param_json` if present;
- use `jsonb` with exactly one table, 15 header entries, and one 15-cell row;
- insert `rule_set` membership for worksets `103` and `433` only when the workset exists and membership is absent;
- use a transaction and `ON CONFLICT`/`NOT EXISTS` patterns compatible with the actual table constraints.

- [ ] **Step 3: Write read-only verification SQL**

The verify file must select:

```sql
select function, instance, rule_id, description, severity,
       param_json#>'{tables,0,header}' as header,
       param_json#>'{tables,0,rows}' as rows
  from rule
 where rule_id = 7305001;

select workset_id, rule_id
  from rule_set
 where rule_id = 7305001
 order by workset_id;
```

Add assertions/check output for the 15-column count, `CREW TEAMS`, symbolic `*`, numeric zero, and memberships `103` and `433`.

- [ ] **Step 4: Apply only to remote `f8_sit_live` after code tests are green**

Use the approved remote connection environment without embedding credentials. Run preflight queries, apply the migration, then run the verify SQL twice to prove idempotency. Record exact command results in the final response; do not put credentials in docs.

---

### Task 8: Add End-To-End PBS, Live, And Scenario Regression Coverage

**Files:**

- Modify/create: `rule-engine-rs/py/tests/` focused connector test
- Modify/create: `pbs-engine/tests/unit/` focused builder/gate test
- Modify: `live-server/scripts/__tests__/legality-recheck-core.test.mjs`
- Create/modify: `e2e/tests/gantt/rule-7305-live.spec.ts`
- Create/modify: `e2e/tests/gantt/rule-7305-scenario.spec.ts`
- Create: `docs/test-cases/gantt/7305-rust-migration.md`
- Create: `image/RUST/7305/` screenshots/artifacts if the repository tracks proof images

**Interfaces:**

- The real UI tests must drive the Live and Scenario Gantt through the user-visible legality workflow, not call internal functions directly.
- The manual test case must describe parameter setup, roster setup, recheck trigger, Alert Center/violation inspection, and expected T/D behavior.

- [ ] **Step 1: Add PyO3/PBS integration cases**

Build the extension with the project’s existing maturin command, construct a minimal Engine with one fixed and one candidate pairing, enable only `7305`, and assert:

```text
fixed-only over-limit sequence + optimizer -> no violation
fixed + candidate over-limit sequence + optimizer -> one violation
same sequence + editor -> one violation
```

- [ ] **Step 2: Add Live real-user regression**

Use the existing authenticated Gantt Playwright setup. Configure a 7305 row in the Live rule UI or fixture, trigger the scoped recheck through the UI, reopen/reload the affected roster, and assert the 7305 violation appears with the expected message/actual/limit. Capture a proof screenshot under `image/RUST/7305/`.

- [ ] **Step 3: Add Scenario real-user regression**

Repeat the same workflow against a scenario ruleset and scenario roster. Assert the shared rule path produces the same violation structure while data comes from Scenario.

- [ ] **Step 4: Add the manual test case**

Document both `T` and `D`, a wildcard row, a qualification-scoped row including Position, a ground-attribute row, a ground-label negative case, PA-only solver tolerance, and mixed PA/candidate solver rejection.

- [ ] **Step 5: Run focused end-to-end tests**

Run the project’s exact Gantt Playwright command/configuration for the two new specs. Expected: PASS with screenshots and no first-paint regression.

---

### Task 9: Broaden Verification And Review The Change Surface

**Files:**

- All touched files from Tasks 1-8
- No new implementation files unless a failing verification command identifies a concrete missing contract

- [ ] **Step 1: Run focused tests in dependency order**

```bash
cargo test --manifest-path rule-engine-rs/Cargo.toml rule_7305 -- --nocapture
node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs
pytest -q pbs-engine/ColumnModelSolver_python/rules/rust/tests/test_rule_7305_params.py
```

- [ ] **Step 2: Build the release Rust artifacts**

```bash
cargo test --release --manifest-path rule-engine-rs/Cargo.toml
cargo build --release --manifest-path rule-engine-rs/Cargo.toml
```

- [ ] **Step 3: Build and test the PyO3 connector**

Use the repository’s existing active virtual environment/maturin command, then run the focused connector tests and the relevant PBS unit tests. Report the exact command if the environment differs from the documented default.

- [ ] **Step 4: Run Live/Scenario binary and source tests**

```bash
node --test live-server/scripts/__tests__/assert-rust-bins.test.mjs
node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs
```

- [ ] **Step 5: Run UI standards only if frontend style files were touched**

```bash
npm run check:ui
```

This task should not touch frontend style files; skip the command only if no UI style file changed and state that explicitly.

- [ ] **Step 6: Run real Playwright tests**

Run the exact configured Live and Scenario Gantt specs, with the project’s required environment variables supplied externally. Do not claim UI completion without the test receipt.

- [ ] **Step 7: Check formatting and unexpected scope**

```bash
git diff --check
git status --short
git diff --stat
```

Review every changed symbol against the explicit call-chain analysis because GitNexus MCP is unavailable. Confirm no unrelated modules, schema files, secrets, generated binaries, or runtime version files were added.

- [ ] **Step 8: Report completion evidence**

The final response must list:

- changed files and architecture;
- C++ semantics covered;
- remote database preflight/apply/verify results;
- every exact verification command with PASS/FAIL;
- any unrun required test and why;
- remaining risk, especially if remote UI credentials, binary deployment, or Playwright environment is unavailable;
- the fact that no commit/push was performed.

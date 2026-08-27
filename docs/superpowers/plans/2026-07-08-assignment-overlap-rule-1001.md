# Assignment Overlap Rule 1001 Implementation Plan

## Completion Status

Status as of 2026-07-09: implementation completed, pushed, merged to `main`, and the feature worktree was removed.

This document is retained as the original implementation plan plus final delivery record. Some path and version instructions below were written before `main` moved the solver integration into the `pbs-engine` submodule.

Completed commits:

- `rule-engine-rs/main` `47f18dc` - `feat: add rule 1001 assignment overlap`
- `pbs-engine/main` `5e1a844` - `feat: pass rule 1001 params to rust checker`
- `pbs-engine/main` `7f3bc2d` - `chore: update rule engine submodule for rule 1001`
- `rois-ai/main` `22c1af04` - `feat: enable rule 1001 assignment overlap`

Actual file/path notes:

- Solver Python changes landed under `pbs-engine/ColumnModelSolver_python/...`.
- Any remaining references below to the old `ro-engine/pbs-rostering-solver-snapshot/...` snapshot path should be treated as stale historical plan text; the active implementation path is `pbs-engine/...`.
- `gantt/src/version.ts` is no longer tracked on `main`; runtime version state moved to ignored `live-server/version.tmp` managed by `scripts/version-state.mjs`. The planned backend version bump is therefore not applicable.
- GitNexus impact analysis and `detect_changes()` were not run because the GitNexus MCP tools were unavailable in the implementation session.
- `cargo fmt` was skipped because `rustfmt` is not installed for `stable-x86_64-unknown-linux-gnu`.

Final verification receipts:

- `cd rule-engine-rs && cargo test --test rule_1001_tests --release` PASS, 5 passed.
- `cd rule-engine-rs && cargo check -p rois-rule-engine-py` PASS, with only the existing `duty_idx` unused warning.
- `cd rule-engine-rs && cargo build -p rois-rule-engine-py --release` PASS.
- `cd rule-engine-rs && cargo test --release` PASS, full Rust release suite.
- `PYTHONPATH=/tmp/rois-rule-engine-rs-py /home/yuan.z/rois/rois-ai/.venv-rule-engine/bin/python3 -m pytest py/tests/test_engine_overlap.py py/tests/test_engine_8056_vac.py py/tests/test_engine_phase0.py -q` PASS, 14 passed.
- `cd pbs-engine && python3 -m compileall tests/unit/test_rust_checker_rule_1001_params.py ColumnModelSolver_python/rules/rust_checker.py` PASS.
- `cd pbs-engine && /home/yuan.z/rois/rois-ai/.venv-rule-engine/bin/python3 -m pytest tests/unit/test_rust_checker_rule_1001_params.py -q` PASS, 1 passed.
- `rg -n "1001001|Assignment Overlap|Assignment Group Before" sql/seed/07-rule.sql sql/migration/2026-07-08-rule-1001-assignment-overlap.sql` PASS by static inspection: expected rule, rule_set, and parameter header entries are present.
- Remote F8 DB migration and verification: `psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off -f sql/migration/2026-07-08-rule-1001-assignment-overlap.sql ...` PASS; inserted 1 rule row and 2 rule_set rows, then verified worksets `103` and `433`.

Remaining / not executed:

- ro_input sample inspection found no `assignmentType` column in checked `Pairing` / `RosterGround` sections, but samples include an `Assignment` section. `pbs-engine` commit `14e3336` now derives assignment types from `Assignment.assignment -> Assignment.type` when explicit `assignmentType` is absent on `Pairing` / `RosterGround`. Remaining risk is limited to proving this through a full DB-generated ro_input solver run.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded Rust overlap gate with parameter-driven Function `1001/001` Assignment Overlap, sourced from Model A `rule.param_json` and enabled in the default F8 worksets.

**Architecture:** Add a pure Rust 1001 overlap kernel in `rule-engine-rs/src/lib.rs`, then wire it into the PyO3 `Engine.check_line` first-gate path in `rule-engine-rs/py/src/lib.rs`. Load `1001/001` rows from `rule.param_json` through the existing PG parameter loader, pass `overlap_rules` into `rre.Engine(...)`, and seed the Model A `rule`/`rule_set` records so the default worksets include the rule.

**Tech Stack:** Rust / Cargo, PyO3, Python pytest, PostgreSQL SQL seed/migration, `pbs-engine` Python solver connector.

## Global Constraints

- Use current Model A rule tables only: `rule`, `rule_set`, and `rule.param_json`.
- Do not use or add `rule_template`, `rule_instance`, `rule_group`, or `rule_group_instance` paths.
- `1001/001` must have `rule_id=1001001`, `owner='S'`, and `locked='1'`.
- Add `1001001` to worksets `103` (`PBS Solver Ruleset`) and `433` (`F8 Full Ruleset`).
- `Assignment Group Before/After` match runtime `roster_flight.assignment_group` exactly; do not add alias mapping such as `FLT→FLY` or `LVE→DO`.
- `Assignment Before/After` match runtime `roster_flight.assignment` exactly.
- `Assignment Type Before/After` match one-letter `assignment.type` values such as `L`, `O`, `W`, `T`, `S`.
- `Before` / `After` are chronological, not existing/candidate source roles.
- `Assignment Rest Before=Y` extends only the earlier task's end bound to post-duty rest end.
- Missing or empty `overlap_rules` must fail closed: detected actual overlaps emit `1001|...`.
- Runtime version bump via `gantt/src/version.ts` is not applicable on current `main`; version state now uses ignored `live-server/version.tmp` managed by `scripts/version-state.mjs`.
- Before implementation edits to existing functions/classes, run GitNexus impact analysis for each touched symbol per repository instructions.
- Do not commit changes unless the user explicitly requests a commit; keep commit-message snippets as optional handoff notes only.

---

## File Structure

- Modify `rule-engine-rs/src/lib.rs`: add 1001 data structs, matching helpers, half-open overlap helper, `check_assignment_overlap`, and focused Rust tests if keeping tests colocated is preferred. Keep old `check_roster_overlap` only for compatibility tests/callers.
- Modify `rule-engine-rs/tests/rule_overlap_tests.rs`: add pure Rust 1001 tests next to existing overlap tests, or create `rule-engine-rs/tests/rule_1001_tests.rs` if the file becomes hard to scan.
- Modify `rule-engine-rs/py/src/lib.rs`: add `OverlapRule` / `OverlapRoster` wrapper structs, constructor argument `overlap_rules`, pass assignment data into normalized timeline, replace `check_overlap` internals to call 1001, emit `1001|...`.
- Modify `rule-engine-rs/py/tests/test_engine_overlap.py`: update existing PyO3 overlap tests from `overlap|` to `1001|`, add configured-allowance and fail-closed cases.
- Modify `pbs-engine/ColumnModelSolver_python/io/pg_rule_params.py`: parse `1001001` `param_json` into `overlap_rules`.
- Modify `pbs-engine/ColumnModelSolver_python/rules/rust_checker.py`: load `overlap_rules` from PG params and pass them into `rre.Engine(...)`.
- Add/update focused `pbs-engine` tests for Rule 1001 parameter plumbing.
- Modify `sql/seed/07-rule.sql`: add `rule` row for `1001/001` and `rule_set` memberships for worksets `103` and `433`.
- Create `sql/migration/2026-07-08-rule-1001-assignment-overlap.sql`: idempotent migration for existing F8 DBs.
- Modify `engine-server/tests/test_ro_input_rule_sections.py` or add focused SQL/static tests if existing fixtures cover `rule_set` membership.
- No `gantt/src/version.ts` edit: file is no longer tracked on `main`; runtime version state is not source-controlled.

---

### Task 1: Add Pure Rust 1001 Kernel

**Files:**
- Modify: `rule-engine-rs/src/lib.rs:2375`
- Test: `rule-engine-rs/tests/rule_1001_tests.rs`

**Interfaces:**
- Consumes: existing `format_hhmm` only if needed for messages; otherwise no dependencies.
- Produces:
  - `pub struct AssignmentOverlapRule { pub group_before: Vec<String>, pub assignment_before: Vec<String>, pub rest_before: bool, pub type_before: Vec<String>, pub group_after: Vec<String>, pub assignment_after: Vec<String>, pub type_after: Vec<String>, pub overlap: bool }`
  - `pub struct AssignmentOverlapRoster { pub id: i64, pub start_utc: i64, pub end_duty_utc: i64, pub end_including_rest_utc: i64, pub assignment_group: String, pub assignment: String, pub assignment_type: String, pub is_pre_assigned: bool }`
  - `pub struct AssignmentOverlapViolation { pub crew_id: String, pub before_id: i64, pub after_id: i64, pub overlap_start_utc: i64, pub overlap_end_utc: i64, pub before_assignment: String, pub after_assignment: String }`
  - `pub fn check_assignment_overlap(crew_id: &str, rosters: &[AssignmentOverlapRoster], rules: &[AssignmentOverlapRule]) -> Vec<AssignmentOverlapViolation>`

- [ ] **Step 1: Read impacted symbol context and run impact analysis**

  Before editing `rule-engine-rs/src/lib.rs`, run GitNexus impact analysis for existing overlap symbols that may be changed or bypassed:

  ```bash
  # Use the GitNexus MCP impact tool if available in the implementation session:
  # impact({target: "check_roster_overlap", direction: "upstream"})
  # impact({target: "is_overlap_detail", direction: "upstream"})
  ```

  Expected: report direct callers and whether the old helper is only used by tests / PyO3 gate. If impact is HIGH or CRITICAL, stop and warn the user before editing.

- [ ] **Step 2: Write failing Rust tests**

  Create `rule-engine-rs/tests/rule_1001_tests.rs` with these tests:

  ```rust
  use rois_rule_engine::{
      check_assignment_overlap, AssignmentOverlapRoster, AssignmentOverlapRule,
  };

  fn roster(
      id: i64,
      start: i64,
      end_duty: i64,
      end_rest: i64,
      group: &str,
      assignment: &str,
      assignment_type: &str,
  ) -> AssignmentOverlapRoster {
      AssignmentOverlapRoster {
          id,
          start_utc: start,
          end_duty_utc: end_duty,
          end_including_rest_utc: end_rest,
          assignment_group: group.to_string(),
          assignment: assignment.to_string(),
          assignment_type: assignment_type.to_string(),
          is_pre_assigned: false,
      }
  }

  fn rule(
      group_before: &[&str],
      assignment_before: &[&str],
      rest_before: bool,
      type_before: &[&str],
      group_after: &[&str],
      assignment_after: &[&str],
      type_after: &[&str],
      overlap: bool,
  ) -> AssignmentOverlapRule {
      AssignmentOverlapRule {
          group_before: group_before.iter().map(|s| s.to_string()).collect(),
          assignment_before: assignment_before.iter().map(|s| s.to_string()).collect(),
          rest_before,
          type_before: type_before.iter().map(|s| s.to_string()).collect(),
          group_after: group_after.iter().map(|s| s.to_string()).collect(),
          assignment_after: assignment_after.iter().map(|s| s.to_string()).collect(),
          type_after: type_after.iter().map(|s| s.to_string()).collect(),
          overlap,
      }
  }

  #[test]
  fn direct_duty_overlap_without_rules_fails_closed() {
      let rosters = [
          roster(1, 0, 10, 20, "FLY", "FLT", "W"),
          roster(2, 5, 15, 15, "DO", "DO", "O"),
      ];
      let out = check_assignment_overlap("C1", &rosters, &[]);
      assert_eq!(out.len(), 1);
      assert_eq!(out[0].before_id, 1);
      assert_eq!(out[0].after_id, 2);
  }

  #[test]
  fn fly_rest_before_allows_l_or_o_after() {
      let rosters = [
          roster(1, 0, 10, 30, "FLY", "FLT", "W"),
          roster(2, 20, 40, 40, "ANY", "VAC", "L"),
      ];
      let rules = [rule(&["FLY"], &["*"], true, &["*"], &["*"], &["*"], &["L", "O"], true)];
      assert!(check_assignment_overlap("C1", &rosters, &rules).is_empty());
  }

  #[test]
  fn rest_before_false_does_not_allow_rest_only_overlap() {
      let rosters = [
          roster(1, 0, 10, 30, "FLY", "FLT", "W"),
          roster(2, 20, 40, 40, "ANY", "VAC", "L"),
      ];
      let rules = [rule(&["FLY"], &["*"], false, &["*"], &["*"], &["*"], &["L", "O"], true)];
      let out = check_assignment_overlap("C1", &rosters, &rules);
      assert_eq!(out.len(), 1);
  }

  #[test]
  fn sby_before_do_after_is_allowed_by_assignment_group_after() {
      let rosters = [
          roster(1, 0, 10, 30, "SBY", "SBY", "S"),
          roster(2, 20, 40, 40, "DO", "DO", "O"),
      ];
      let rules = [rule(&["SBY"], &["*"], true, &["*"], &["DO"], &["*"], &["*"], true)];
      assert!(check_assignment_overlap("C1", &rosters, &rules).is_empty());
  }

  #[test]
  fn boundary_touch_is_not_overlap() {
      let rosters = [
          roster(1, 0, 10, 10, "FLY", "FLT", "W"),
          roster(2, 10, 20, 20, "DO", "DO", "O"),
      ];
      assert!(check_assignment_overlap("C1", &rosters, &[]).is_empty());
  }
  ```

- [ ] **Step 3: Run tests to verify failure**

  Run:

  ```bash
  cd /home/yuan.z/rois/rois-ai/rule-engine-rs
  cargo test --test rule_1001_tests --release
  ```

  Expected: FAIL to compile with unresolved imports for `AssignmentOverlapRule`, `AssignmentOverlapRoster`, and `check_assignment_overlap`.

- [ ] **Step 4: Implement the minimal kernel**

  In `rule-engine-rs/src/lib.rs`, add this code after the existing hardcoded overlap section or immediately before it with a clear `Rule 1001` section header:

  ```rust
  #[derive(Debug, Clone, PartialEq, Eq)]
  pub struct AssignmentOverlapRule {
      pub group_before: Vec<String>,
      pub assignment_before: Vec<String>,
      pub rest_before: bool,
      pub type_before: Vec<String>,
      pub group_after: Vec<String>,
      pub assignment_after: Vec<String>,
      pub type_after: Vec<String>,
      pub overlap: bool,
  }

  #[derive(Debug, Clone, PartialEq, Eq)]
  pub struct AssignmentOverlapRoster {
      pub id: i64,
      pub start_utc: i64,
      pub end_duty_utc: i64,
      pub end_including_rest_utc: i64,
      pub assignment_group: String,
      pub assignment: String,
      pub assignment_type: String,
      pub is_pre_assigned: bool,
  }

  #[derive(Debug, Clone, PartialEq, Eq)]
  pub struct AssignmentOverlapViolation {
      pub crew_id: String,
      pub before_id: i64,
      pub after_id: i64,
      pub overlap_start_utc: i64,
      pub overlap_end_utc: i64,
      pub before_assignment: String,
      pub after_assignment: String,
  }

  impl AssignmentOverlapViolation {
      pub fn message(&self) -> String {
          format!(
              "1001|before={}|after={}|before_assignment={}|after_assignment={}|overlap_start={}|overlap_end={}",
              self.before_id,
              self.after_id,
              self.before_assignment,
              self.after_assignment,
              self.overlap_start_utc,
              self.overlap_end_utc,
          )
      }
  }

  fn assignment_filter_matches(filter: &[String], value: &str) -> bool {
      filter.is_empty()
          || filter.iter().any(|v| {
              let s = v.trim();
              s.is_empty() || s == "*" || s == value
          })
  }

  fn assignment_windows_overlap(a_start: i64, a_end: i64, b_start: i64, b_end: i64) -> Option<(i64, i64)> {
      let start = a_start.max(b_start);
      let end = a_end.min(b_end);
      if start < end { Some((start, end)) } else { None }
  }

  fn rule_allows_overlap(
      before: &AssignmentOverlapRoster,
      after: &AssignmentOverlapRoster,
      rule: &AssignmentOverlapRule,
  ) -> Option<(i64, i64)> {
      if !rule.overlap {
          return None;
      }
      if !assignment_filter_matches(&rule.group_before, &before.assignment_group)
          || !assignment_filter_matches(&rule.assignment_before, &before.assignment)
          || !assignment_filter_matches(&rule.type_before, &before.assignment_type)
          || !assignment_filter_matches(&rule.group_after, &after.assignment_group)
          || !assignment_filter_matches(&rule.assignment_after, &after.assignment)
          || !assignment_filter_matches(&rule.type_after, &after.assignment_type)
      {
          return None;
      }
      let before_end = if rule.rest_before {
          before.end_including_rest_utc
      } else {
          before.end_duty_utc
      };
      assignment_windows_overlap(before.start_utc, before_end, after.start_utc, after.end_duty_utc)
  }

  pub fn check_assignment_overlap(
      crew_id: &str,
      rosters: &[AssignmentOverlapRoster],
      rules: &[AssignmentOverlapRule],
  ) -> Vec<AssignmentOverlapViolation> {
      let mut sorted: Vec<&AssignmentOverlapRoster> = rosters.iter().collect();
      sorted.sort_by_key(|r| (r.start_utc, r.end_duty_utc, r.id));

      let mut out = Vec::new();
      for i in 0..sorted.len() {
          let before = sorted[i];
          for after in sorted.iter().skip(i + 1) {
              let actual_end = before.end_including_rest_utc.max(before.end_duty_utc);
              let Some((actual_start, actual_overlap_end)) = assignment_windows_overlap(
                  before.start_utc,
                  actual_end,
                  after.start_utc,
                  after.end_duty_utc,
              ) else {
                  if after.start_utc >= actual_end {
                      break;
                  }
                  continue;
              };
              let allowed = rules.iter().any(|rule| rule_allows_overlap(before, after, rule).is_some());
              if !allowed {
                  out.push(AssignmentOverlapViolation {
                      crew_id: crew_id.to_string(),
                      before_id: before.id,
                      after_id: after.id,
                      overlap_start_utc: actual_start,
                      overlap_end_utc: actual_overlap_end,
                      before_assignment: before.assignment.clone(),
                      after_assignment: after.assignment.clone(),
                  });
              }
          }
      }
      out
  }
  ```

- [ ] **Step 5: Run Rust kernel tests**

  Run:

  ```bash
  cd /home/yuan.z/rois/rois-ai/rule-engine-rs
  cargo test --test rule_1001_tests --release
  ```

  Expected: PASS all `rule_1001_tests`.

---

### Task 2: Replace PyO3 Overlap Gate

**Files:**
- Modify: `rule-engine-rs/py/src/lib.rs:22-29`
- Modify: `rule-engine-rs/py/src/lib.rs:147-243`
- Modify: `rule-engine-rs/py/src/lib.rs:419-467`
- Modify: `rule-engine-rs/py/src/lib.rs:1033-1156`
- Test: `rule-engine-rs/py/tests/test_engine_overlap.py`

**Interfaces:**
- Consumes from Task 1: `AssignmentOverlapRule`, `AssignmentOverlapRoster`, `check_assignment_overlap`.
- Produces: PyO3 `Engine(..., overlap_rules=[...])`, and `check_line()` overlap messages starting with `1001|`.

- [ ] **Step 1: Run impact analysis for PyO3 methods**

  Before editing `rule-engine-rs/py/src/lib.rs`, run GitNexus impact for:

  ```bash
  # impact({target: "Engine::new", direction: "upstream"})
  # impact({target: "Engine::check_line", direction: "upstream"})
  # impact({target: "Engine::check_overlap", direction: "upstream"})
  ```

  Expected: report direct callers/tests and confirm risk before edits. If risk is HIGH/CRITICAL, warn user first.

- [ ] **Step 2: Update failing PyO3 tests**

  In `rule-engine-rs/py/tests/test_engine_overlap.py`, replace the old prefix assertions and add configured rules:

  ```python
  DEFAULT_1001_RULES = [
      (["FLY"], ["*"], True, ["*"], ["*"], ["*"], ["L", "O"], True),
      (["SBY"], ["*"], True, ["*"], ["*"], ["*"], ["L", "O"], True),
      (["FLY"], ["*"], True, ["*"], ["DO"], ["*"], ["*"], True),
      (["SBY"], ["*"], True, ["*"], ["DO"], ["*"], ["*"], True),
  ]
  ```

  Update `test_fixed_fly_overlaps_candidate_rest_via_engine` expected prefix:

  ```python
  assert out[0].startswith("1001|")
  assert "before=1" in out[0]
  assert "after=0" in out[0]
  ```

  Update the DO tolerance test to pass a `DO` group and default 1001 rules:

  ```python
  eng = rre.Engine(
      pairing_start_utc=[cand_start],
      pairing_end_utc=[cand_duty_end],
      pairing_end_including_rest_utc=[cand_rest_end],
      pairing_blk_min=[60],
      crew_fixed_pairings=[[]],
      pairing_is_fly=[True],
      pairing_label=["CAND"],
      pairing_assignment_group=["FLY"],
      crew_ground_start=[[do_start]],
      crew_ground_end=[[do_end]],
      crew_ground_assignment=[["DO"]],
      crew_ground_group=[["DO"]],
      crew_ground_type=[["O"]],
      overlap_rules=DEFAULT_1001_RULES,
      block_bands=[],
  )
  overlap_only = [o for o in eng.check_line(0, [0]) if o.startswith("1001|")]
  assert overlap_only == []
  ```

  Add a fail-closed test:

  ```python
  def test_empty_overlap_rules_fail_closed():
      eng = rre.Engine(
          pairing_start_utc=[0, 5],
          pairing_end_utc=[10, 20],
          pairing_end_including_rest_utc=[10, 20],
          pairing_blk_min=[60, 60],
          crew_fixed_pairings=[[0]],
          pairing_is_fly=[True, True],
          pairing_assignment_group=["FLY", "FLY"],
          block_bands=[],
          overlap_rules=[],
      )
      out = eng.check_line(0, [1])
      assert any(o.startswith("1001|") for o in out), out
  ```

- [ ] **Step 3: Run PyO3 overlap tests to verify failure**

  Run:

  ```bash
  cd /home/yuan.z/rois/rois-ai/rule-engine-rs/py
  python -m pytest tests/test_engine_overlap.py -q
  ```

  Expected: FAIL because `Engine` does not accept `overlap_rules` / `crew_ground_type`, and existing output still starts with `overlap|`.

- [ ] **Step 4: Import Task 1 types**

  In `rule-engine-rs/py/src/lib.rs`, update the `use rois_rule_engine::{...}` import to include:

  ```rust
  check_assignment_overlap, AssignmentOverlapRoster, AssignmentOverlapRule,
  ```

- [ ] **Step 5: Add wrapper structs and fields**

  Near existing `GroundDuty` and `SpacingRule`, add:

  ```rust
  struct OverlapRuleParam {
      group_before: Vec<String>,
      assignment_before: Vec<String>,
      rest_before: bool,
      type_before: Vec<String>,
      group_after: Vec<String>,
      assignment_after: Vec<String>,
      type_after: Vec<String>,
      overlap: bool,
  }
  ```

  Add to PyO3 `Engine` struct:

  ```rust
  overlap_rules: Vec<OverlapRuleParam>,
  crew_ground_type: Vec<Vec<String>>,
  ```

- [ ] **Step 6: Extend constructor signature**

  Add defaults in the `#[pyo3(signature = (...))]` block after `crew_ground_is_rest`:

  ```rust
  crew_ground_type = Vec::new(),
  overlap_rules = Vec::new(),
  ```

  Add function parameters after `crew_ground_is_rest`:

  ```rust
  crew_ground_type: Vec<Vec<String>>,
  overlap_rules: Vec<(Vec<String>, Vec<String>, bool, Vec<String>, Vec<String>, Vec<String>, Vec<String>, bool)>,
  ```

- [ ] **Step 7: Validate and store new constructor data**

  After `crew_ground_tz_min` validation, add type-list validation:

  ```rust
  if !crew_ground_type.is_empty() && crew_ground_type.len() != ncrew {
      return Err(PyValueError::new_err(format!(
          "crew_ground_type must be empty or length {ncrew}, got {}",
          crew_ground_type.len()
      )));
  }
  for (c, types) in crew_ground_type.iter().enumerate() {
      let m = crew_ground.get(c).map(Vec::len).unwrap_or(0);
      if !types.is_empty() && types.len() != m {
          return Err(PyValueError::new_err(format!(
              "crew_ground_type[{c}] must be empty or length {m}, got {}",
              types.len()
          )));
      }
  }
  let overlap_rules: Vec<OverlapRuleParam> = overlap_rules
      .into_iter()
      .map(|(group_before, assignment_before, rest_before, type_before, group_after, assignment_after, type_after, overlap)| OverlapRuleParam {
          group_before,
          assignment_before,
          rest_before,
          type_before,
          group_after,
          assignment_after,
          type_after,
          overlap,
      })
      .collect();
  ```

  In `Ok(Engine { ... })`, set:

  ```rust
  overlap_rules,
  crew_ground_type,
  ```

- [ ] **Step 8: Replace `check_overlap` body with 1001 timeline**

  Replace the body of `fn check_overlap(...)` with:

  ```rust
  let to_rule = |r: &OverlapRuleParam| AssignmentOverlapRule {
      group_before: r.group_before.clone(),
      assignment_before: r.assignment_before.clone(),
      rest_before: r.rest_before,
      type_before: r.type_before.clone(),
      group_after: r.group_after.clone(),
      assignment_after: r.assignment_after.clone(),
      type_after: r.type_after.clone(),
      overlap: r.overlap,
  };
  let rules: Vec<AssignmentOverlapRule> = self.overlap_rules.iter().map(to_rule).collect();
  let mut rosters: Vec<AssignmentOverlapRoster> = Vec::new();
  for (is_pa, slice) in [(true, fixed), (false, candidate)] {
      for &pi in slice {
          let p = &self.pairings[pi];
          rosters.push(AssignmentOverlapRoster {
              id: pi as i64,
              start_utc: p.start_utc,
              end_duty_utc: p.end_duty_utc,
              end_including_rest_utc: p.end_including_rest_utc,
              assignment_group: p.group.clone(),
              assignment: if p.is_fly { "FLY".to_string() } else { p.group.clone() },
              assignment_type: p.assignment_type.clone(),
              is_pre_assigned: is_pa,
          });
      }
  }
  if crew_idx < self.crew_ground.len() {
      for (i, g) in self.crew_ground[crew_idx].iter().enumerate() {
          let assignment_type = self
              .crew_ground_type
              .get(crew_idx)
              .and_then(|row| row.get(i))
              .cloned()
              .unwrap_or_else(|| Self::ground_assignment_type(&g.assignment, &g.group));
          rosters.push(AssignmentOverlapRoster {
              id: -(i as i64 + 1),
              start_utc: g.start_utc,
              end_duty_utc: g.end_utc,
              end_including_rest_utc: g.end_utc,
              assignment_group: g.group.clone(),
              assignment: g.assignment.clone(),
              assignment_type,
              is_pre_assigned: true,
          });
      }
  }
  for v in check_assignment_overlap(crew_id, &rosters, &rules) {
      out.push(v.message());
  }
  ```

- [ ] **Step 9: Update `n_rules` and repr expectations**

  Keep overlap counted as one always-on rule in PyO3 `n_rules()` because fail-closed means the gate exists even with empty config. Update test expectations only where the output prefix changes; existing `n_rules` tests should still expect overlap included.

- [ ] **Step 10: Run PyO3 overlap tests**

  Run:

  ```bash
  cd /home/yuan.z/rois/rois-ai/rule-engine-rs/py
  python -m pytest tests/test_engine_overlap.py -q
  ```

  Expected: PASS.

---

### Task 3: Parse 1001 Params from PG Workset

**Files:**
- Modify: `pbs-engine/ColumnModelSolver_python/io/pg_rule_params.py:83-113`
- Test: create `pbs-engine/tests/unit/test_pg_rule_params_1001.py` if no existing unit exists for this parser.

**Interfaces:**
- Consumes: `rule.param_json` flattened by `_param_rows` into uppercase header keys.
- Produces: `out["overlap_rules"]` as `list[tuple[list[str], list[str], bool, list[str], list[str], list[str], list[str], bool]]`.

- [ ] **Step 1: Run impact analysis for parser function**

  Before editing, run:

  ```bash
  # impact({target: "load_rule_params", direction: "upstream"})
  ```

  Expected: direct caller includes `RustRuleChecker.bind_problem`; risk should be manageable.

- [ ] **Step 2: Add parser tests**

  Create `tests/unit/test_pg_rule_params_1001.py` with direct helper coverage by monkeypatching `load_workset` and `_connect`:

  ```python
  from ColumnModelSolver_python.io import pg_rule_params

  def test_load_rule_params_extracts_1001_overlap_rules(monkeypatch):
      param_json = {
          "tables": [{
              "header": [
                  "Assignment Group Before",
                  "Assignment Before",
                  "Assignment Rest Before",
                  "Assignment Type Before",
                  "Assignment Group After",
                  "Assignment After",
                  "Assignment Type After",
                  "Overlap",
              ],
              "rows": [
                  ["FLY", "*", "Y", "", "", "*", "L|O", "Y"],
                  ["SBY", "*", "Y", "", "DO", "*", "", "Y"],
              ],
          }]
      }

      monkeypatch.setenv("PG_PASSWORD", "dummy")
      monkeypatch.setattr(pg_rule_params, "_connect", lambda password: object(), raising=False)

      def fake_load_workset(conn, workset):
          return [{"function": 1001, "instance": "001", "param_json": param_json}]

      import ColumnModelSolver_python.io.pg_ruleset_to_ro_input as ruleset
      monkeypatch.setattr(ruleset, "_connect", lambda password: object())
      monkeypatch.setattr(ruleset, "load_workset", fake_load_workset)

      out = pg_rule_params.load_rule_params(workset=103, password="dummy")
      assert out["overlap_rules"] == [
          (["FLY"], ["*"], True, ["*"], ["*"], ["*"], ["L", "O"], True),
          (["SBY"], ["*"], True, ["*"], ["DO"], ["*"], ["*"], True),
      ]
  ```

- [ ] **Step 3: Run parser test to verify failure**

  Run:

  ```bash
  cd /home/yuan.z/rois/rois-ai/pbs-engine
  python -m pytest tests/unit/test_pg_rule_params_1001.py -q
  ```

  Expected: FAIL because `overlap_rules` is not extracted.

- [ ] **Step 4: Add `_yn` helper and 1001 parsing**

  In `pg_rule_params.py`, near `_codes`, add:

  ```python
  def _yn(v: str | None) -> bool:
      return str(v or "").strip().upper() == "Y"
  ```

  After the 8056 `spacing_rules` block, add:

  ```python
  overlap_rules: list[tuple[list[str], list[str], bool, list[str], list[str], list[str], list[str], bool]] = []
  for p in by_comp.get("1001001", []):
      overlap_rules.append((
          _codes(p.get("ASSIGNMENT GROUP BEFORE")),
          _codes(p.get("ASSIGNMENT BEFORE")),
          _yn(p.get("ASSIGNMENT REST BEFORE")),
          _codes(p.get("ASSIGNMENT TYPE BEFORE")),
          _codes(p.get("ASSIGNMENT GROUP AFTER")),
          _codes(p.get("ASSIGNMENT AFTER")),
          _codes(p.get("ASSIGNMENT TYPE AFTER")),
          _yn(p.get("OVERLAP")),
      ))
  if overlap_rules:
      out["overlap_rules"] = overlap_rules
  ```

- [ ] **Step 5: Run parser test**

  Run:

  ```bash
  cd /home/yuan.z/rois/rois-ai/pbs-engine
  python -m pytest tests/unit/test_pg_rule_params_1001.py -q
  ```

  Expected: PASS.

---

### Task 4: Pass 1001 Params and Assignment Types into Rust Checker

**Files:**
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust_checker.py:171-190`
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust_checker.py:217-231`
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust_checker.py:267-303`

**Interfaces:**
- Consumes from Task 3: `pp.get("overlap_rules", [])`.
- Produces: `rre.Engine(..., overlap_rules=eff_overlap_rules, crew_ground_type=cg_type, pairing_assignment_group=[...])`.

- [ ] **Step 1: Run impact analysis for `RustRuleChecker.bind_problem`**

  Run:

  ```bash
  # impact({target: "RustRuleChecker.bind_problem", direction: "upstream"})
  ```

  Expected: direct solver checker construction path; report risk before edits.

- [ ] **Step 2: Add effective overlap params**

  In `bind_problem`, after `eff_spacing_rules`, add:

  ```python
  eff_overlap_rules = pp.get("overlap_rules", [])
  ```

- [ ] **Step 3: Build ground assignment types**

  Near `cg_start`, `cg_end`, `cg_assign`, `cg_group`, add:

  ```python
  cg_type: list[list[str]] = []
  ```

  In the `for crew in problem.crews:` ground task loop, append:

  ```python
  cg_type.append([str(getattr(t, "assignment_type", "") or getattr(t, "type", "") or "") for t in tasks])
  ```

  If `preassign_tasks` currently lacks `assignment_type`, this safely sends empty strings and Rust falls back to existing group/code behavior. A later task can improve the data model join if needed.

- [ ] **Step 4: Pass params into `rre.Engine`**

  Add to the `rre.Engine(...)` call:

  ```python
  crew_ground_type=cg_type,
  overlap_rules=eff_overlap_rules,
  ```

- [ ] **Step 5: Add a checker-level unit if a lightweight fixture exists**

  If there is an existing `RustRuleChecker` unit fixture, add an assertion that a fake `pp` with `overlap_rules` reaches `rre.Engine`. If no fixture exists, skip creating a broad fake `Problem`; Task 2 PyO3 tests and Task 3 parser tests cover the contract.

- [ ] **Step 6: Run focused tests**

  Run:

  ```bash
  cd /home/yuan.z/rois/rois-ai/pbs-engine
  python -m pytest tests/unit/test_pg_rule_params_1001.py -q
  ```

  Expected: PASS.

  Then run PyO3 overlap tests again:

  ```bash
  cd /home/yuan.z/rois/rois-ai/rule-engine-rs/py
  python -m pytest tests/test_engine_overlap.py -q
  ```

  Expected: PASS.

---

### Task 5: Seed and Migrate Model A Rule 1001

**Files:**
- Modify: `sql/seed/07-rule.sql:53-69`
- Modify: `sql/seed/07-rule.sql:74-104`
- Create: `sql/migration/2026-07-08-rule-1001-assignment-overlap.sql`
- Test: `engine-server/tests/test_ro_input_rule_sections.py` if fixtures can inspect seed/migration state; otherwise static SQL review commands below.

**Interfaces:**
- Produces Model A rule row `1001001` and membership rows for worksets `103` and `433`.
- Consumed by Task 3 `load_rule_params()` through `load_workset()`.

- [ ] **Step 1: Add seed rule row**

  In `sql/seed/07-rule.sql`, add one row to the `INSERT INTO rule (...) OVERRIDING SYSTEM VALUE VALUES` list. Choose the next explicit `id` after existing rows, for example `31` if unused in the seed:

  ```sql
  (31, 'system', now(), 'system', now(), 1001, '001', 'R', 'Assignment Overlap', 'ROIs', 'Roster', 'Table', 'ROIs', 'Assignment Overlap', 'S', 1, 'F8', 'P', 'S', '1', '', 1001001, '{"tables": [{"rows": [["FLY", "*", "Y", "*", "*", "*", "L|O", "Y"], ["SBY", "*", "Y", "*", "*", "*", "L|O", "Y"], ["FLY", "*", "Y", "*", "DO", "*", "*", "Y"], ["SBY", "*", "Y", "*", "DO", "*", "*", "Y"]], "header": ["Assignment Group Before", "Assignment Before", "Assignment Rest Before", "Assignment Type Before", "Assignment Group After", "Assignment After", "Assignment Type After", "Overlap"]}]}'::jsonb),
  ```

  Keep SQL syntax valid: the previous row needs a trailing comma and the final row before `ON CONFLICT` must not have an extra comma.

- [ ] **Step 2: Add seed rule_set memberships**

  In the `rule_set` seed `VALUES`, add two explicit rows using unused ids after existing rows, for example:

  ```sql
  (55, 'system', now(), 'system', now(), 103, 1001001),
  (56, 'system', now(), 'system', now(), 433, 1001001)
  ```

  Keep membership order sensible: place 1001 first for each workset if users expect the gate first, or append if avoiding id/order churn is more important. Since existing ids are explicit, appending with new ids is the safest seed-only change.

- [ ] **Step 3: Create migration for existing F8 DBs**

  Create `sql/migration/2026-07-08-rule-1001-assignment-overlap.sql`:

  ```sql
  -- =============================================================================
  -- 2026-07-08 rule 1001 Assignment Overlap
  -- Adds Model A system template rule 1001/001 and enables it in F8 default worksets.
  -- =============================================================================

  set search_path = f8;

  begin;

  insert into rule (
      created_by, created_at, updated_by, updated_at,
      function, instance, class, description, reference, category,
      store_structure, source, detail, overridability, severity,
      filiale, division, owner, locked, exception_code, rule_id, param_json
  )
  select
      'system', now(), 'system', now(),
      1001, '001', 'R', 'Assignment Overlap', 'ROIs', 'Roster',
      'Table', 'ROIs', 'Assignment Overlap', 'S', 1,
      'F8', 'P', 'S', '1', '', 1001001,
      '{"tables": [{"rows": [["FLY", "*", "Y", "*", "*", "*", "L|O", "Y"], ["SBY", "*", "Y", "*", "*", "*", "L|O", "Y"], ["FLY", "*", "Y", "*", "DO", "*", "*", "Y"], ["SBY", "*", "Y", "*", "DO", "*", "*", "Y"]], "header": ["Assignment Group Before", "Assignment Before", "Assignment Rest Before", "Assignment Type Before", "Assignment Group After", "Assignment After", "Assignment Type After", "Overlap"]}]}'::jsonb
  where not exists (
      select 1 from rule where rule_id = 1001001
  );

  insert into rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
  select 'system', now(), 'system', now(), v.workset_id, 1001001
  from (values (103), (433)) as v(workset_id)
  where exists (select 1 from workset w where w.id = v.workset_id)
    and not exists (
      select 1 from rule_set rs
      where rs.workset_id = v.workset_id
        and rs.rule_id = 1001001
    );

  commit;
  ```

- [ ] **Step 4: Static SQL verification**

  Run a syntax/static check without applying to production if no sandbox DB is available:

  ```bash
  cd /home/yuan.z/rois/rois-ai
  rg -n "1001001|Assignment Overlap|Assignment Group Before" sql/seed/07-rule.sql sql/migration/2026-07-08-rule-1001-assignment-overlap.sql
  ```

  Expected: both files contain `1001001`, `Assignment Overlap`, and the exact header labels.

- [ ] **Step 5: Optional DB verification on an authorized F8 test DB**

  Only if credentials and authorization are available, run against the remote F8 DB per project rules:

  ```sql
  select function, instance, rule_id, owner, locked, description
  from rule
  where rule_id = 1001001;

  select workset_id, rule_id
  from rule_set
  where rule_id = 1001001
  order by workset_id;
  ```

  Expected: one rule row, two membership rows for `103` and `433`.

---

### Task 6: Bump Backend Version (Not Applicable on Current Main)

**Files:**
- No tracked file change on current `main`; `gantt/src/version.ts` was removed from tracked source.

**Interfaces:**
- Consumes: current project version-state rule.
- Produces: no source-controlled version edit; runtime version state is managed by `scripts/version-state.mjs` and ignored `live-server/version.tmp`.

- [x] **Step 1: Confirm current version mechanism**

  `gantt/src/version.ts` is not tracked on current `main`. Version state now lives in ignored runtime state under `live-server/version.tmp` and is managed by `scripts/version-state.mjs`.

- [x] **Step 2: Skip source-controlled backend version bump**

  No source-controlled version file was changed.

- [x] **Step 3: Verify no UI standard check is needed**

  This task changed no frontend UI styles or UI text. `npm run check:ui` was not required for the docs-only completion update.

---

### Task 7: End-to-End Focused Verification

**Files:**
- No new files expected.

**Interfaces:**
- Consumes all prior tasks.
- Produces test receipts for Rust, PyO3, parser, and SQL/static scope.

- [ ] **Step 1: Run Rust pure kernel tests**

  ```bash
  cd /home/yuan.z/rois/rois-ai/rule-engine-rs
  cargo test --test rule_1001_tests --release
  ```

  Expected: PASS.

- [ ] **Step 2: Run existing overlap regression tests**

  ```bash
  cd /home/yuan.z/rois/rois-ai/rule-engine-rs
  cargo test --test rule_overlap_tests --release
  ```

  Expected: PASS. If old hardcoded helper tests fail because the helper was removed, restore the helper for compatibility or update only tests that now cover the PyO3 gate; do not weaken 1001 behavior.

- [ ] **Step 3: Run PyO3 overlap tests**

  ```bash
  cd /home/yuan.z/rois/rois-ai/rule-engine-rs/py
  python -m pytest tests/test_engine_overlap.py -q
  ```

  Expected: PASS.

- [ ] **Step 4: Run PG params parser test**

  ```bash
  cd /home/yuan.z/rois/rois-ai/pbs-engine
  python -m pytest tests/unit/test_pg_rule_params_1001.py -q
  ```

  Expected: PASS.

- [ ] **Step 5: Run a targeted broader PyO3 smoke set**

  ```bash
  cd /home/yuan.z/rois/rois-ai/rule-engine-rs/py
  python -m pytest tests/test_engine_overlap.py tests/test_engine_8056_vac.py tests/test_engine_phase0.py -q
  ```

  Expected: PASS. This checks 1001 replacement does not break existing 8056 grouped rules or empty-engine behavior.

- [ ] **Step 6: Run GitNexus detect_changes before any commit/PR**

  Use GitNexus change detection per repository instructions:

  ```bash
  # detect_changes({scope: "compare", base_ref: "main"})
  ```

  Expected: affected symbols are limited to 1001 overlap kernel, PyO3 engine construction/check gate, PG parameter loading, Rust checker plumbing, SQL seed/migration, and version bump.

- [ ] **Step 7: Report exact verification results**

  Final handoff must include each command and PASS/FAIL result. If any command was skipped, state why and the remaining risk.

---

## Plan Self-Review

- Spec coverage: Tasks cover pure Rust 1001 kernel, PyO3 replacement gate, PG `param_json` parsing, solver parameter plumbing, Model A `rule`/`rule_set` seed+migration, fail-closed behavior, exact group matching, default workset membership, and focused verification.
- Placeholder scan: No implementation step uses `TBD`, open-ended “handle edge cases”, or unnamed tests. Optional DB verification is explicitly gated on authorization.
- Type consistency: `AssignmentOverlapRule`, `AssignmentOverlapRoster`, and `AssignmentOverlapViolation` names are consistent across Rust and PyO3 tasks. Python `overlap_rules` tuple shape matches the spec and Rust constructor shape.
- Project constraints: Plan includes GitNexus impact/detect steps, backend version bump, no Model B changes, no alias mapping, and no commits unless requested.

# Rule 7508 Duty Report/Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Rule 7508 `Duty Report` and `Duty Release` Y/N parameters so rest gaps can use duty boundaries or first/last flight boundaries, with `Duty Release` controlling `rest_start` and `Duty Report` controlling `rest_end`.

**Architecture:** Rule 7508 remains owned by `rule-engine-rs`; live/scenario recheck and PBS optimizer adapters only parse parameters and provide the extra duty-level timestamps. Existing 7508 rows default to `Y/Y` for backward-compatible behavior.

**Tech Stack:** Rust rule engine + PyO3 bridge, live-server Node ESM scripts, PBS Python adapter/tests, SQL seed/migration, Gantt Help docs.

## Global Constraints

- Do not change Rule 7501 semantics.
- Use scheduled roster/segment flight departure/arrival for `Duty Release=N` (`rest_start`) or `Duty Report=N` (`rest_end`).
- Existing/legacy 7508 rows without the two new columns default to `Duty Report=Y`, `Duty Release=Y`.
- Add an idempotent SQL migration and seed update only; do not manually mutate remote databases during implementation.

---

### Task 1: Rust Rule 7508 Model and Tests

**Files:**
- Modify: `rule-engine-rs/src/rules/rule7508.rs`
- Modify: `rule-engine-rs/src/bin/check_7508.rs`
- Modify: `rule-engine-rs/py/src/lib.rs`
- Test: `rule-engine-rs/tests/rule_7508_tests.rs`
- Test: `rule-engine-rs/py/tests/test_engine_7508_calendar_sdfd.py`

**Interfaces:**
- `Rule7508Row` gains `duty_report: bool` and `duty_release: bool`.
- `WorkPeriod7508` gains `first_flight_departure_utc: i64` and `last_flight_arrival_utc: i64`.
- `check-7508` `R` rows accept 12 columns with `Duty Report` and `Duty Release`; 10-column legacy `D` rows still parse, while 12-column `D` rows include first/last flight times.

- [ ] Add tests for the four parameter combinations.
- [ ] Verify the tests fail because the new fields/semantics do not exist.
- [ ] Implement boundary selection and parser compatibility.
- [ ] Re-run Rust and PyO3 focused tests.

### Task 2: Live/Scenario Recheck Wiring

**Files:**
- Modify: `live-server/scripts/assignment-overlap-rest-sql.mjs`
- Modify: `live-server/scripts/live-legality.mjs`
- Modify: `live-server/scripts/scenario-legality.mjs`
- Modify: `live-server/scripts/scenario-legality-source.mjs`
- Modify: `live-server/scripts/legality-recheck-core.mjs`
- Test: `live-server/scripts/__tests__/legality-recheck-core.test.mjs`
- Test: `live-server/scripts/__tests__/assignment-overlap-rest-sql.test.mjs`
- Test: `live-server/scripts/verify-flyduties-sql.mjs`

**Interfaces:**
- `flyDuties(true)` returns `first_flight_departure_secs` and `last_flight_arrival_secs`.
- Rule 7508 reads `Duty Report` / `Duty Release` with fallback `Y`.
- TSV emitted to `check-7508` includes start/end plus first/last flight timestamps.

- [ ] Add tests that capture the new parameter row and duty TSV fields.
- [ ] Verify tests fail under current TSV shape.
- [ ] Add SQL helper expressions for scheduled first flight departure and last flight arrival.
- [ ] Wire all live/scenario sources and Rule 7508 TSV generation.
- [ ] Re-run focused live-server tests and SQL-shape verification.

### Task 3: PBS Rust Adapter Compatibility

**Files:**
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/rule_params.py`
- Modify: `pbs-engine/ColumnModelSolver_python/rules/internal/params.py`
- Test: `pbs-engine/tests/unit/test_rust_rule_7508_params.py`
- Test: `pbs-engine/tests/unit/test_rule_checker_calendar_day_free.py`

**Interfaces:**
- `calendar_sdfd_rule_rows` tuples include `(period, unit, duty_report, duty_release, duty_end_buffer_secs, min_limits)` for Rust.
- Internal prefilter continues to store/use `(period_hours, min_free, buffer_secs)` and ignores the new columns except for parsing compatibility.

- [ ] Add tests for new and legacy 7508 headers.
- [ ] Verify they fail where tuple shapes/headers do not match.
- [ ] Implement parser defaults and PyO3 tuple mapping.
- [ ] Re-run focused PBS tests.

### Task 4: Seed, Migration, and Help

**Files:**
- Modify: `sql/seed/07-rule.sql`
- Create: `sql/migration/2026-08-13-rule-7508-duty-report-release.sql`
- Modify: `gantt/src/components/help/topics/legality/_rule-doc.tsx`

**Interfaces:**
- 7508 seed and migration param tables include `Duty Report` and `Duty Release` after `Unit`.
- Migration only updates `function = 7508` rules and inserts `Y/Y` into existing rows missing the columns.

- [ ] Add SQL migration with JSONB transformation guarded by header checks.
- [ ] Update seed rows for 7508.
- [ ] Update Help parameter descriptions.
- [ ] Run focused static/test checks for touched docs/tests where available.

### Task 5: Final Verification

- [ ] Run `cargo test -p rois-rule-engine rule_7508`.
- [ ] Run `npm --prefix live-server test -- legality-recheck-core`.
- [ ] Run `npm --prefix live-server test -- assignment-overlap-rest-sql`.
- [ ] Run `node live-server/scripts/verify-flyduties-sql.mjs` if it is non-mutating in the local setup.
- [ ] Run `pytest pbs-engine/tests/unit/test_rust_rule_7508_params.py pbs-engine/tests/unit/test_rule_checker_calendar_day_free.py`.
- [ ] Run `git diff --check`.
- [ ] Report the GitNexus impact/detect_changes limitation if MCP tools are still unavailable.

# Rule 7509 Avoid Co-pairing Implementation Plan

> Implementation completed. The task checklists below describe the executed design steps; final
> verification receipts are recorded in the delivery context and the focused Playwright regression.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Rule 7509 (`Avoid Co-pairing`) to the active F8 legality and PBS solver paths, using one Rust kernel for Live, Scenario, draft preview, and optimizer complement checks.

**Architecture:** Normalize 7509 parameter rows and flight-level roster members into a dedicated dependency-free Rust kernel. The `check-7509` binary consumes the same normalized contract used by the shared Live/Scenario legality core, while the PyO3 engine keeps a mutable flight complement with pairing span and PA provenance for incremental solver checks. Live and Scenario remain unified in `legality-recheck-core.mjs`; source-specific SQL stays in the existing adapters.

**Tech Stack:** Rust 2021/std, Cargo integration tests, PyO3/maturin connector, Node.js ESM legality scripts, PostgreSQL migration/seed SQL, Playwright Gantt E2E.

## Global Constraints

- Rule 7509/001 parameters are exactly `Crew A`, `Crew B`, `Eff Date`, `Exp Date`.
- Crew IDs are trimmed strings; invalid rows and reversed date ranges are skipped with diagnostics; self-pairs are ignored; pairs are symmetric.
- Date bounds are inclusive and a pairing is in scope when its closed report/release span overlaps the parameter range.
- Evaluation grain is physical `flt_id`; duplicate `(flight, crew)` members are deduplicated before matching.
- Editor/Live/Scenario always report; optimizer suppresses only violations whose two contributing members are both PA.
- Do not alter roster, pairing, flight, or rule-violation schemas; do not change 8030/8072 semantics.
- UI language remains English and no new Gantt component/layout is required.
- No speculative cache/retry/config abstraction and no automatic git commit or push.

### Task 1: Rust 7509 kernel

**Files:**
- Create: `rule-engine-rs/src/rules/rule7509.rs`
- Modify: `rule-engine-rs/src/rules/mod.rs`
- Modify: `rule-engine-rs/src/lib.rs`
- Create: `rule-engine-rs/tests/rule_7509_tests.rs`

**Interfaces:**
- `Rule7509Param::from_cells(&[&str]) -> Result<Rule7509Param, String>` parses one four-cell row and normalizes dates/crew IDs.
- `Rule7509Member` contains `flight_id`, `crew_id`, `pairing_id`, `pairing_start_utc`, `pairing_end_utc`, and `source_is_pa`.
- `Rule7509Violation` contains `crew_id`, `paired_crew_id`, `pairing_id`, and `flight_id`.
- `check_avoid_co_pairing(params, members, application) -> Vec<Rule7509Violation>` performs flight-grain deduplication, interval filtering, symmetric pair matching, and optimizer PA-only suppression.

- [ ] **Step 1: Write failing kernel tests** for inclusive effective/expiry boundaries, no overlap, invalid/reversed rows, symmetric pairs, self-pair ignore, same flight across pairings, all crew members, duplicate member deduplication, multiple independent rows, and PA-only suppression.
- [ ] **Step 2: Run the focused test**:
  `cargo test --manifest-path rule-engine-rs/Cargo.toml --test rule_7509_tests`
  Expected: compile/test failure because the module and exported API do not exist.
- [ ] **Step 3: Implement the smallest kernel** with explicit normalized types, `parse_date_ord` reuse, closed interval overlap, `BTreeMap`/`BTreeSet` flight grouping, and deterministic output ordering.
- [ ] **Step 4: Run the focused test again** and require PASS before adding adapters.

### Task 2: `check-7509` binary contract

**Files:**
- Create: `rule-engine-rs/src/bin/check_7509.rs`
- Modify: `rule-engine-rs/Cargo.toml`
- Modify: `rule-engine-rs/tests/rule_7509_tests.rs`

**Interfaces:**
- stdin TSV uses `R` rows for `instance`, `Crew A`, `Crew B`, `Eff Date`, `Exp Date`, and `M` rows for normalized roster members.
- `check-7509 --emit-tsv` emits deterministic violation fields sufficient for `legality-recheck-core.mjs` to attribute crew/pairing/flight.

- [ ] **Step 1: Add a failing CLI test** that feeds two pairings sharing one physical flight and asserts both affected crew members are emitted, with PA-only mode represented explicitly in the input contract.
- [ ] **Step 2: Run the CLI test** with the focused Cargo test command and confirm failure is caused by the missing binary.
- [ ] **Step 3: Implement TSV parsing, diagnostics to stderr, editor/optimizer mode selection, and `--emit-tsv` output without external dependencies.**
- [ ] **Step 4: Run `cargo test --manifest-path rule-engine-rs/Cargo.toml --test rule_7509_tests` and `cargo build --release --manifest-path rule-engine-rs/Cargo.toml`; require PASS.

### Task 3: PBS PyO3 incremental complement

**Files:**
- Modify: `rule-engine-rs/py/src/lib.rs`
- Modify/create focused tests under `rule-engine-rs/py/tests/test_engine_7509.py` and/or `rule-engine-rs/tests/engine_check_line.rs`
- Modify: solver connector input assembly files only where the existing 8030/8072 `CrewOnFlight` payload is built

**Interfaces:**
- Add parsed `Rule7509Param` rows to the PyO3 `Engine` constructor.
- Preserve member pairing span and PA source in a 7509 sidecar; a flight/crew-only seed is insufficient.
- Add `can_add_pairing_7509`, `commit_pairing_7509`, and `rollback_pairing_7509` methods alongside the existing 8030/8072 methods.

- [ ] **Step 1: Write failing PyO3 tests** for parameter loading/gating, candidate-only checks, fixed and committed complements, rollback, same-flight merge, and PA-only versus PA-plus-candidate behavior.
- [ ] **Step 2: Run the focused PyO3 test command** used by the repository venv and record the expected missing-attribute/API failure.
- [ ] **Step 3: Add constructor validation and sidecar indexing** keyed by physical flight, retaining crew index, pairing index/span, and PA state; use a fast configured-crew set before scanning candidate flights.
- [ ] **Step 4: Call 7509 from `check_line()` as the final line-level guard and classify it in the active-rule gate beside 8030/8072.**
- [ ] **Step 5: Run the focused PyO3 tests and the existing 8030/8072 engine tests; require PASS.

### Task 4: Shared Live/Scenario legality core and source adapters

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs`
- Modify: `live-server/scripts/live-legality.mjs`
- Modify: `live-server/scripts/scenario-legality.mjs`
- Modify: `live-server/scripts/scenario-legality-source.mjs`
- Modify: `live-server/src/services/rule/legality-preview.ts` only if its seed/source adapter needs the new accessor
- Create/modify: `live-server/scripts/__tests__/rule-7509.test.mjs`
- Create/modify: source SQL shape tests for Live, Scenario, and Seed adapters

**Interfaces:**
- Add source accessor `avoidCoPairing(filters?)` returning normalized FLY members with physical flight ID and pairing report/release span.
- Add `rule7509(source, ctx)` to the shared `RULES` list so `ONLY_CODES=7509` selects only this rule.
- Convert binary rows into `rule_violation` objects with rule code/instance, stable scope key containing parameter row identity and normalized pair, crew/pairing attribution, flight time window, severity overlay, and an English message naming both crew IDs and flight.

- [ ] **Step 1: Write failing core tests** for parameter parsing, invalid-row diagnostics, inclusive span overlap, stable scope keys, all-crew complement loading, duplicate suppression, and `ONLY_CODES=7509`.
- [ ] **Step 2: Write failing SQL-shape tests** asserting FLY pairing filtering, report/release bounds, `roster_flight.flt_id` physical-flight joins, scenario live-mate fallback, and focus-pairing expansion for draft preview.
- [ ] **Step 3: Implement the normalized source contract** in all adapters by following the existing 8030/8072 query style and keeping scenario `scenario_id` predicates authoritative.
- [ ] **Step 4: Implement `rule7509` and register it in the shared core.**
- [ ] **Step 5: Run focused Node tests:**
  `node --test live-server/scripts/__tests__/rule-7509.test.mjs`
  `node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs live-server/scripts/__tests__/qualification-flight-segments-materialize-sql.test.mjs`
  Expected: all PASS with no stale binary failures in unit-only tests.

### Task 5: Rule catalog seed and deployed migration

**Files:**
- Modify: `sql/seed/07-rule.sql`
- Create: `sql/migration/2026-08-23-rule-7509-add-f8-ruleset.sql`
- Create: `sql/migration/verify/2026-08-23-rule-7509-add-f8-ruleset-verify.sql`
- Create: migration fixture/second-run verification only if the repository convention requires it

**Interfaces:**
- Provision `rule_id=7509001`, function `7509`, instance `001`, description `Avoid Co-pairing`, and the exact four-column parameter table.
- Add idempotent `rule_set` membership to workset `103`; preserve existing memberships and catalog metadata conventions.

- [ ] **Step 1: Add SQL verification assertions** for one rule row, exact header, idempotent membership, and no duplicate rows.
- [ ] **Step 2: Run the verifier against a disposable/approved remote dev schema or the repository SQL test harness and confirm it fails before the seed/migration exists.**
- [ ] **Step 3: Add seed and migration using existing `insert ... where not exists` / update conventions; do not add schema objects.**
- [ ] **Step 4: Run the verifier twice and perform a remote PostgreSQL read-only check of rule definition, JSON header/rows, and workset 103 membership.

### Task 6: Gantt end-to-end regression

**Files:**
- Create/modify: the existing Gantt rule-check Playwright spec under `e2e/tests/gantt/rule-check/` or the repository’s current legality regression location
- Add only test fixtures/helpers required to create or discover a persisted 7509 violation; no new UI component

- [ ] **Step 1: Add a failing Playwright scenario** that uses the real Gantt legality workflow, opens Alert Center, and asserts a persisted 7509 row identifies the affected crew and flight.
- [ ] **Step 2: Run the focused Playwright test and record the expected missing-catalog/violation failure.
- [ ] **Step 3: Adapt only test data/setup needed to exercise the real Live or Scenario path, without hardcoding business IDs when a discovery helper exists.
- [ ] **Step 4: Run the focused Playwright command and `npm run check:ui` if any frontend file is touched; require PASS.

### Task 7: Final verification and context handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-08-23-rule-7509-avoid-co-pairing.md` checkboxes
- Create/update: `docs/dev-context/` only if the cross-module work remains unfinished at the end of the session

- [x] **Step 1: Run focused Rust kernel/CLI and PyO3 tests.**
- [x] **Step 2: Run Live/Scenario legality core/source tests and remote migration/read-only checks.**
- [x] **Step 3: Run the focused Playwright regression and any required TypeScript checks for touched modules.**
- [x] **Step 4: Run `git diff --check` and inspect `git status --short`; preserve unrelated pre-existing changes.**
- [x] **Step 5: Report exact PASS/FAIL commands, blockers, test gaps, and remaining risk; do not claim completion when an environment-backed required test is unavailable.**

## Self-Review Against the Approved Design

- Rust kernel covers date normalization, inclusive overlap, physical-flight grain, duplicate dedupe, symmetric matching, multiple rows, and PA-only filtering.
- The binary and PyO3 engine consume the same kernel semantics.
- Live, Scenario, and seed adapters expose the same normalized source contract; the shared core owns rule registration, attribution, scope keys, severity overlay, and `ONLY_CODES` behavior.
- Database provisioning is additive and idempotent, with no schema changes.
- UI coverage drives the real Gantt workflow and reuses the existing Alert Center.

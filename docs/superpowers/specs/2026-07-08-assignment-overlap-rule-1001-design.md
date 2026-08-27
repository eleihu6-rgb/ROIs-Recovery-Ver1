# Assignment Overlap Rule 1001 Design

## Completion Status

Status as of 2026-07-09: implemented, committed, pushed, and merged to `main`.

Related commits:

- `rule-engine-rs/main` `47f18dc` - `feat: add rule 1001 assignment overlap`
- `pbs-engine/main` `5e1a844` - `feat: pass rule 1001 params to rust checker`
- `pbs-engine/main` `7f3bc2d` - `chore: update rule engine submodule for rule 1001`
- `rois-ai/main` `22c1af04` - `feat: enable rule 1001 assignment overlap`

Implementation notes:

- The active solver integration path is now the `pbs-engine` submodule, not the old `ro-engine/pbs-rostering-solver-snapshot/...` snapshot path.
- `gantt/src/version.ts` is no longer tracked on `main`; version state is handled by ignored runtime state via `live-server/version.tmp` and `scripts/version-state.mjs`, so the old backend version bump instruction is not applicable for this delivery.
- GitNexus impact analysis and `detect_changes()` were required by project instructions but the GitNexus MCP tools were not available in the implementation session. They were skipped and are recorded here as unavailable.
- `cargo fmt` was attempted but skipped because `rustfmt` is not installed for `stable-x86_64-unknown-linux-gnu`.

Verification completed:

- `rule-engine-rs`: `cargo test --test rule_1001_tests --release` PASS, 5 passed.
- `rule-engine-rs`: `cargo check -p rois-rule-engine-py` PASS, with only the existing `duty_idx` unused warning.
- `rule-engine-rs`: `cargo build -p rois-rule-engine-py --release` PASS.
- `rule-engine-rs`: `cargo test --release` PASS, full Rust release suite.
- PyO3 smoke using `/tmp/rois-rule-engine-rs-py/rois_rule_engine_rs.so`: `py/tests/test_engine_overlap.py py/tests/test_engine_8056_vac.py py/tests/test_engine_phase0.py` PASS, 14 passed.
- `pbs-engine`: `python3 -m compileall ...` PASS.
- `pbs-engine`: `/home/yuan.z/rois/rois-ai/.venv-rule-engine/bin/python3 -m pytest tests/unit/test_rust_checker_rule_1001_params.py -q` PASS, 1 passed.
- SQL static check: `rg -n "1001001|Assignment Overlap|Assignment Group Before" sql/seed/07-rule.sql sql/migration/2026-07-08-rule-1001-assignment-overlap.sql` showed the expected seed and migration entries.
- Remote F8 DB migration and verification: `psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off -f sql/migration/2026-07-08-rule-1001-assignment-overlap.sql ...` PASS; inserted 1 rule row and 2 rule_set rows, then verified worksets `103` and `433`.

Remaining verification risk:

- Existing ro_input samples checked so far do not contain `assignmentType` in `Pairing` / `RosterGround` headers, but they do contain an `Assignment` section. `pbs-engine` commit `14e3336` now derives assignment types from `Assignment.assignment -> Assignment.type` when explicit `assignmentType` is absent on `Pairing` / `RosterGround`. Remaining risk is limited to proving this through a full DB-generated ro_input solver run.

## Goal

Add Function `1001` / instance `001` as the system-default **Assignment Overlap** legality rule in the current Model A rule system. Rule 1001 replaces the existing hardcoded Rust overlap gate: `check_line` still evaluates assignment overlap before other rules, but violations are emitted as `1001|...` and configurable parameter rows define which overlaps are allowed.

The rule checks whether two tasks on the same crew overlap. If an actual overlap is not allowed by the configured parameter matrix, it produces a warning/violation. If a row with `Overlap=Y` matches the overlapping task pair, that overlap is allowed and no violation is emitted.

## Current Rule Model

The current source of truth is the Model A rule model:

- `rule` stores system template rules and copied rule instances.
- `rule.instance='001'`, `owner='S'`, and `locked='1'` represent a system template rule.
- `rule.rule_id` is the composite `function || lpad(instance, 3, '0')`, so Function `1001` instance `001` uses `rule_id=1001001`.
- `rule_set` binds worksets to `rule.rule_id`.
- Rule parameters live in `rule.param_json`.

This design does not use or modify obsolete Model B tables.

## Rule Seed / Migration Requirements

Add a new Model A rule row:

- `function`: `1001`
- `instance`: `001`
- `rule_id`: `1001001`
- `description`: `Assignment Overlap`
- `category`: `Roster` or the closest existing category used by roster-level rules
- `store_structure`: `Table`
- `owner`: `S`
- `locked`: `1`
- `filiale`: `F8`
- `division`: `P`
- `param_json`: one table containing the Assignment Overlap matrix

Add `rule_set` membership for `rule_id=1001001` to both default worksets:

- `103` — `PBS Solver Ruleset`
- `433` — `F8 Full Ruleset`

The SQL must be idempotent. Follow `sql/seed/07-rule.sql` patterns: explicit `OVERRIDING SYSTEM VALUE` ids in seeds where needed, or a migration using `WHERE NOT EXISTS` / conflict-safe inserts without assuming new identity values.

## Parameter Table

The 1001 template parameter table has this header:

```text
Assignment Group Before
Assignment Before
Assignment Rest Before
Assignment Type Before
Assignment Group After
Assignment After
Assignment Type After
Overlap
```

Default rows:

```text
FLY, *, Y, *, *,  *, L|O, Y
SBY, *, Y, *, *,  *, L|O, Y
FLY, *, Y, *, DO, *, *,   Y
SBY, *, Y, *, DO, *, *,   Y
```

Blank cells and `*` are both wildcards. Pipe-delimited values such as `L|O` mean OR-list matching.

Field meanings:

- `Assignment Group Before/After` matches runtime `roster_flight.assignment_group` exactly.
- `Assignment Before/After` matches runtime `roster_flight.assignment` exactly.
- `Assignment Type Before/After` matches `assignment.type`, loaded by joining the runtime assignment code to the `assignment` master table before data reaches Rust.
- `Assignment Rest Before=Y` means the earlier task's overlap window ends at **duty end**.
- `Assignment Rest Before=N` means the earlier task's overlap window ends at **rest end** (post-duty rest included).
- Parameter rows are a **blacklist**: filter match + that window ∩ After duty → `1001`; filter match without window hit → Allow; empty rules or unmatched filters → fail-closed.
- (Historical: before 2026-07-23, Y/N window mapping was inverted and rows were allowances.)
- Overlap column removed 2026-07-22.

The Rust engine must not translate assignment-group aliases. For example, it must not map `FLT` to `FLY` or `LVE` to `DO`. Configuration values match the runtime data values as-is.

## Runtime Semantics

### Timeline Normalization

Build one crew timeline from:

- fixed pairings already assigned to the crew,
- candidate pairings being checked,
- pre-assigned ground tasks from the crew roster.

Each normalized item carries:

- source flag: pre-assigned vs candidate,
- pairing id or negative synthetic ground id,
- `assignment_group`,
- `assignment`,
- assignment `type`,
- duty start/end UTC,
- rest end UTC.

### Before / After Direction

For every pair that overlaps, determine `Before` and `After` by chronological order, not by source:

- `Before` = the task with the earlier start time.
- `After` = the task with the later start time.
- If start times are equal, use deterministic ordering by end time and id so results are stable.

This makes parameter behavior consistent across live/editor and optimizer use cases.

### Overlap Window

For a given pair:

- The `Before` task starts at its duty start.
- If a matching rule row has `Assignment Rest Before=Y`, the `Before` window ends at **duty end**.
- If `Assignment Rest Before=N`, the `Before` window ends at **rest end**.
- The `After` task uses its duty start/end only. Its rest is not considered by this design.

An actual overlap exists when either the two duty windows intersect, or the earlier task's post-duty-rest window intersects the later task's duty window. Parameter rows decide whether that detected overlap is **prohibited**. Exact boundary touch should be legal when one task ends exactly when the next starts.

### Prohibition Matching

After an actual time overlap is detected:

1. If `overlap_rules` is empty → emit `1001|...`.
2. If no row’s Before/After filters match → emit `1001|...`.
3. If any filter-matching row’s Rest-Before window intersects After duty → emit `1001|...`.
4. Otherwise (filters match but no Rest-Before window hit) → allow.

If multiple rows match filters, any single Rest-Before window hit is enough to emit `1001|...`.

### Fail-Closed Behavior

If `overlap_rules` is missing or empty, no overlaps are allowed. Any detected actual overlap emits `1001|...`.

If `overlap_rules` is present but no row’s filters match a detected overlap, emit `1001|...`.

## Rust / Python Integration

### Rust Core

Add a parameter-driven 1001 kernel, separate from the current hardcoded overlap helper. The kernel should accept normalized roster items and `OverlapRule` rows, then return violations for disallowed overlaps.

The existing hardcoded `check_roster_overlap` behavior should no longer be the gate used by `check_line`. It may remain as a compatibility helper only if tests or other callers still require it.

Expected violation string shape:

```text
1001|before=<id>|after=<id>|before_assignment=<code>|after_assignment=<code>|overlap_start=<utc>|overlap_end=<utc>
```

The exact fields can follow existing engine style, but the prefix must be `1001|`.

### Python Wrapper

Extend the PyO3 `Engine(...)` constructor with an `overlap_rules` parameter, similar to `spacing_rules`.

Suggested shape:

```text
Vec<(
  Vec<String>,  # group_before
  Vec<String>,  # assignment_before
  bool,         # rest_before
  Vec<String>,  # type_before
  Vec<String>,  # group_after
  Vec<String>,  # assignment_after
  Vec<String>,  # type_after
  bool          # overlap
)>
```

The wrapper should parse empty strings and `*` into wildcard filters, and split pipe-delimited cells into vectors before passing rules into the Rust kernel.

### Data Loading

The backend/solver parameter-loading path should read rule `1001/001` from the selected workset and convert its `param_json` table rows into `overlap_rules` for the Rust engine.

Because `Assignment Type Before/After` depends on `assignment.type`, the data-loading layer must provide each timeline item with the assignment type derived from the `assignment` master table. Rust should not query the database.

## Testing

Minimum automated coverage:

1. Rust unit tests for the pure 1001 kernel:
   - direct duty overlap not in config emits `1001|`;
   - `FLY` before `L`/`O` after with `rest_before=Y` allows rest-only (duty window misses);
   - same data with `rest_before=N` emits `1001|` (rest window hits);
   - `FLY` duty∩`DO` with `rest_before=Y` emits `1001|`;
   - unmatched After filters with rules present still emit `1001|`;
   - blank/`*` wildcard and `L|O` OR matching work;
   - exact end/start boundary does not count as overlap.
2. PyO3 tests for constructor parsing / `check_line` integration:
   - `overlap_rules=[]` is fail-closed;
   - configured rows suppress allowed overlap;
   - disallowed overlap prefix is `1001|`, not `overlap|`.
3. SQL/static verification:
   - `rule` contains `function=1001`, `instance='001'`, `rule_id=1001001`;
   - `rule_set` contains `1001001` for worksets `103` and `433`;
   - `param_json` header and four rows match this spec.

No Playwright test is required unless implementation changes Gantt UI behavior beyond the data already rendered by existing legality views.

## Risks / Notes

- This change is intentionally fail-closed. Missing parameter loading may create more 1001 violations rather than silently allowing illegal overlaps.
- Exact assignment-group matching means existing data must use the same group codes as the rule rows. If runtime data uses `FLT` while config uses `FLY`, that is a data/config mismatch, not a Rust aliasing problem.
- The current hardcoded overlap helper uses older assignment-type concepts. Rule 1001 should use the new one-letter `assignment.type` taxonomy for `Assignment Type Before/After`.
- The rule is evaluated before other rules, so message volume and solver pruning behavior can change as soon as `1001/001` is loaded into the active ruleset.

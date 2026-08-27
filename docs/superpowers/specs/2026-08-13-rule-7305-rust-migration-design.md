# Rule 7305 Rust Migration Design

**Date:** 2026-08-13
**Status:** Design approved in conversation; implementation pending written-spec review

## Goal

Migrate C++ legality rule 7305, “Limit Max Consecutive Duty Times for PR,” to the active Rust legality engine, rename the parameter header `TEAMS` to `CREW TEAMS`, and make the same rule implementation available to the PBS solver, Live Gantt, and Scenario Gantt.

The remote SIT Live database schema `f8_sit_live` must contain the rule instance and enable it in the PBS Solver Ruleset (`103`) and the F8 Full Ruleset (`433`). The default parameter row must preserve the C++ 15-column positional format, with symbolic parameters initialized to `*` and numeric parameters initialized to `0`.

## Scope

Included:

- A shared Rust 7305 rule kernel with C++-compatible matching and consecutive-duty calculations.
- PyO3/PBS solver wiring through the existing in-process Rust connector.
- A `check-7305` Rust binary for the shared Live/Scenario legality recheck core.
- Shared Live/Scenario JavaScript rule registration and result mapping.
- Crew position qualification propagation, while preserving existing qualification dimensions.
- Parameter parsing and serialization for the 15-column rule format, including `CREW TEAMS` and backward-compatible parsing of `TEAMS`.
- Idempotent SQL migration/seed changes for rule metadata, parameters, and ruleset membership.
- Focused Rust, PyO3, PBS, Node, and real-UI regression tests.

Excluded:

- Changes to the legacy `ro-engine` or `po-engine` implementations.
- Changes to tracked database schema definitions under `sql/schema/`.
- Replacing the existing in-process PBS connector or binary execution architecture with an HTTP service.
- Unrelated rule refactors or broad qualification-model redesign.

## C++ Semantics To Preserve

The source of truth is:

- `crewrule-dev/RuleEngine/rule/rule7305/LimitMaxConsecutiveDutyTimesForPRRule.cpp`
- `crewrule-dev/RuleEngine/rule/rule7305/LimitMaxConsecutiveDutyTimesForPRRule.h`
- `crewrule-dev/RuleEngine/rule/rule7305/LimitMaxConsecutiveDutyTimesForPRRuleParam.cpp`
- `crewrule-dev/RuleEngine/rule/rule7305/LimitMaxConsecutiveDutyTimesForPRRuleParam.h`
- `crewrule-dev/RuleEngine/rule7305.cpp`
- `crewrule-dev/RuleEngine/rule/framework/utils/RosterUtils.cpp`
- `crewrule-dev/RuleEngine/rule/framework/utils/TimeUtils.cpp`
- `crewrule-dev/db/Utility.cpp`

The rule parameter is a 15-position CSV row:

| Position | Meaning |
|---:|---|
| 1 | Bases |
| 2 | Ranks |
| 3 | Positions |
| 4 | Fleets |
| 5 | Crew Teams; serialized header is `CREW TEAMS` |
| 6 | Assignment Groups |
| 7 | Assignments |
| 8 | Labels |
| 9 | Attributes |
| 10 | Compatibility/unused |
| 11 | Compatibility/unused |
| 12 | Consecutive Type, `T` or `D` |
| 13 | Compatibility/unused |
| 14 | Maximum Consecutive Times |
| 15 | Severity |

Matching rules:

- Empty values and `*` are wildcards.
- Crew qualification matching includes base, rank, position, fleet, and crew team.
- Qualification matching is effective-date-aware.
- Roster matching includes assignment, assignment-group membership, pairing attributes (including ground-roster attributes), and pairing labels.
- A ground roster does not match a non-wildcard label.
- A roster skipped by the current phase, or a roster that does not match the parameter scope, resets continuity.

Consecutive calculations:

- `T`: the first matching roster contributes `1`. Each later matching roster contributes `1` only when the previous roster’s rest local day and the current roster’s start local day are equal or adjacent.
- `D`: the first matching roster contributes the C++ calendar-day span, where `DiffCalendarDay` is epoch-day difference plus one. A same-local-day continuation contributes the current span minus one; a next-local-day continuation contributes the current span. Other gaps reset continuity.
- A violation is emitted only when `actual > max`.
- The violation span starts at the first matching roster start UTC and ends at the last matching roster rest end UTC.

Messages must match the C++ wording:

- Type `T`: `The number of consecutive rosters ({actual}) with the attribute ({attributes}) or label ({labels}) exceeds the threshold ({max})`
- Type `D`: `The number of consecutive roster days ({actual}) with the specified attribute ({attributes}) or label ({labels}) exceeds the threshold ({max}).`

## Architecture

### Shared Rust Kernel

Add a 7305 rule module under `rule-engine-rs/src/rules/`, register it in `rule-engine-rs/src/rules/mod.rs`, and expose the required shared types/functions through the existing public API in `rule-engine-rs/src/lib.rs`.

The kernel accepts normalized rule instances, crew qualifications, crew teams, and roster activity rows. It owns:

- parameter decoding;
- qualification and roster matching;
- local-day and UTC-span calculations;
- `T`/`D` continuity state;
- strict threshold comparison;
- Editor versus Optimizer behavior;
- machine-readable violation output.

The kernel must not know whether its caller is PBS, Live, or Scenario.

### PBS Solver

Extend the existing PyO3 connector path:

- preserve 7305’s 15 positional parameter columns;
- pass position qualifications separately or through an explicitly typed qualification structure;
- add 7305 to the enabled-function gate and `check_line` invocation;
- retain `Application::Optimizer` semantics.

`Optimizer` must tolerate a violation made up only of pre-assigned/fixed roster rows. It must report a violation when the newly assigned candidate participates in the violating consecutive sequence. `Editor` must report the full legality result, including PA-only violations.

### Live and Scenario

Add one shared JavaScript rule function, `rule7305(source, ctx)`, to `live-server/scripts/legality-recheck-core.mjs` and the common `RULES` registry.

The function must:

1. Resolve instances with `ctx.instancesOf(7305)`.
2. Obtain all matching crew roster activities through the adapter contract.
3. Invoke `check-7305` using the existing batch binary runner.
4. Map each machine-readable violation to the existing persisted violation shape, including rule code, resolved rule instance, scope key, triggering pairing/ground activity, UTC span, severity, actual, limit, and C++ message.
5. Return a clean no-op when no 7305 instances exist.

Live and Scenario may differ only in source adapters. Both adapters must expose the same position-aware qualification contract and the same normalized roster fields required by 7305.

### Binary Contract

Add `check-7305` to the Rust binary manifests and deployed-binary freshness list.

The structured input must preserve the 15-column rule row and include typed records for:

- rule rows (`R`);
- crew qualification rows for base, rank, fleet, and position (`Q`);
- crew team rows (`T`);
- roster activity rows (`D`), including crew, activity/pairing identity, start, duty end, rest end, assignment, assignment group, attributes, labels, local offset, PA status, and phase data where required.

The output must include at least rule row index/instance, crew, triggering activity, UTC start/end, actual, limit, and severity/message fields in a format that cannot be confused with data values.

## Database Configuration

Add an idempotent migration under `sql/migration/` following existing rule migration conventions. Do not modify confirmed schema files.

The migration must:

- create or update rule function `7305`, instance `001`, expected rule identity `7305001`;
- use the existing metadata conventions for description, division, category, source/class, and severity;
- use `CREW TEAMS` in the parameter header;
- preserve exactly 15 parameter positions;
- initialize symbolic fields to `*`;
- initialize numeric fields to `0`;
- initialize the consecutive type with the supported default value used by nearby rule conventions;
- add rule membership to rule sets `103` and `433`;
- be safe to execute more than once.

Before and after applying the migration, run read-only checks against remote `f8_sit_live`. No database password, token, or connection string may be written to source files or documentation.

## Error Handling and Compatibility

- Invalid rule rows must fail with a clear validation error identifying the rule instance and positional field.
- Missing optional qualification collections are treated as empty collections, not as wildcards.
- `*` and empty symbolic values are wildcards; numeric `0` remains a numeric value and must not be treated as missing.
- Unknown compatibility columns remain accepted and preserved in the 15-column representation.
- Unsupported consecutive type values must be rejected rather than silently selecting `T` or `D`.
- Binary startup, input, and output failures must use the existing legality-core error handling and must not silently produce a successful empty result.
- Existing rules and existing rule parameter formats must remain unchanged.

## Test Strategy

### Rust Kernel

Add focused tests covering:

- first `T` roster;
- same-day and next-day `T` continuation;
- discontinuity reset;
- first multi-day `D` roster;
- same-day and next-day `D` continuation;
- strict `>` threshold boundary;
- assignment, group, attribute, and label matching;
- wildcard behavior;
- base/rank/position/fleet/team qualification matching;
- effective-date qualification boundaries;
- Editor reporting of PA-only violations;
- Optimizer tolerance of PA-only violations;
- Optimizer reporting of mixed PA/candidate violations;
- exact C++ violation messages and UTC spans.

### PyO3 and PBS

Add focused tests for:

- `Engine(... enabled_functions=["7305"])` gating;
- connector constructor shape and array validation;
- candidate-only and PA-only solver behavior;
- `CREW TEAMS` parsing;
- backward-compatible `TEAMS` parsing;
- 15-column positional preservation;
- numeric zero values;
- position qualification extraction.

### Live/Scenario

Extend shared legality-core tests with a fake adapter covering:

- `T` and `D` modes;
- scope filtering;
- assignment/group/attribute/label matching;
- PA behavior;
- violation output mapping;
- clean skip with no 7305 instance.

Add or update real Playwright coverage for Live and Scenario user-visible legality behavior. Capture required proof artifacts under `image/RUST/7305/` and verify that legality data remains asynchronous to first Gantt paint.

## Verification and Delivery

Run the smallest focused tests after each implementation unit, then broaden to:

```text
cargo test --release
focused PyO3 pytest after maturin build
focused PBS pytest
focused Live/Scenario Node tests
connector and module build checks
npm run check:ui when frontend style files are touched
git diff --check
remote pre/post SQL checks against f8_sit_live
real Live/Scenario Playwright tests
```

Final reporting must include exact commands and PASS/FAIL results, unrun required checks, blockers, and residual risks. Do not claim completion from code inspection alone. Do not automatically commit or push.

## Known Tooling Limitation

The GitNexus MCP tools requested by the project guide were unavailable during recovery. Before editing, symbol impact will be approximated with explicit repository call-chain inspection and focused tests. This limitation will be reported with the final verification results unless GitNexus becomes available.

# PBS 8071/8072 Runtime Legality Design

Date: 2026-07-25

## Goal

PBS solver must check rule 8071 and rule 8072 during optimization, not only in Live/Scenario legality rechecks. Final PBS results should not be invalidated by predictable 8071/8072 violations that the optimizer could have prevented while constructing assignments.

## Current State

Live/Scenario already run:

- `rule8071` through `live-server/scripts/legality-recheck-core.mjs` and `rule-engine-rs/src/bin/check_8071.rs`.
- `rule8072` through `live-server/scripts/legality-recheck-core.mjs` and `rule-engine-rs/src/bin/check_8072.rs`.

PBS currently treats 8071 and 8072 as enabled only when present in `RuleSet`, but both are `unwired_functions` because `pbs-engine/ColumnModelSolver_python/rules/rust/rule_gates.py` does not include them in `_PYO3_WIRED_FUNCTIONS`.

## C++ Reference

The C++ 8072 implementation is `crewrule-dev/RuleEngine/rule8072.cpp`, entrypoint `LegalityChecker::checkGenMinQualByFleetAndRank`. It uses the dynamic crew-on-flight context:

- `getDataContext()->crewOnFlt`
- `CrewOnFlight`
- segment/flight data
- crew rank, assignment, nationality, team, and qualifications

This means 8072 is not a pure single-crew rolling rule. It is a complement rule evaluated against the current crews on each affected flight segment.

## Rule 8071 PBS Design

8071 is a roster-property count rule. It fits the existing PBS PyO3 `Engine.check_line(crew_idx, candidate_pairing_idxs)` model.

PBS will:

1. Parse 8071 param rows from `Rule` / `RuleSet` / param sections into typed rows compatible with `rule-engine-rs/src/rule8071.rs`.
2. Build per-crew roster-property activity rows from fixed rosters, candidate pairings, pairing duty/segment details, assignment groups, labels, attributes, base/rank/fleet/team, flight, destination, and position fields available in ro_input.
3. Evaluate 8071 inside PyO3 `check_line`.
4. Treat optimizer mode as hard legality for candidate-created violations while preserving existing PA tolerance where the Rust core supports it.

Gate result:

- 8071 moves out of `unwired_functions`.
- 8071 appears in `actual_check_functions`.

## Rule 8072 PBS Design

8072 must be checked during optimization, but it must not be forced into the ordinary per-crew `check_line` shape. PBS will add a complement-aware runtime checker backed by the shared Rust 8072 evaluator.

PBS / PyO3 will maintain an incremental crew-on-flight state:

- `segment_id -> Rule8072Segment`
- `pairing_idx -> affected segment_ids`
- `segment_id -> current crew-on-flight list`
- `crew_idx -> Rule8072Crew` fields
- `segment_id -> planned_by_rank / filled_by_rank`
- `rule rows -> Rule8072`

During assignment attempts:

1. The solver proposes `crew_idx + pairing_idx`.
2. The checker temporarily adds that crew to every flight segment in the pairing.
3. It evaluates only those affected segments against 8072 rows.
4. It rejects the candidate immediately when any affected segment violates `Max Limits`.
5. It handles `Min Limits` with feasibility semantics:
   - If current qualified count already satisfies the minimum, allow.
   - If current qualified count is below minimum but remaining open planned slots can still satisfy the missing qualified count, allow.
   - If current qualified count is below minimum and remaining open planned slots cannot satisfy the missing qualified count, reject.
6. The checker rolls back the temporary add after the check. When the solver commits an assignment, it commits the crew-on-flight update.

This mirrors the C++ dynamic `crewOnFlt` approach while keeping PBS's in-process Rust/PyO3 architecture.

Gate result:

- 8072 moves out of `unwired_functions`.
- 8072 appears in a new `complement_check_functions` category.
- 8072 does not appear in `actual_check_functions` unless the code explicitly documents that the name includes complement-aware checks. The preferred design keeps the categories separate.

## Solver Integration

8071 should be called through the existing Rust checker used by `check_single` / `check_all`.

8072 must be called at every point where PBS decides whether to add or swap an assignment:

- seniority greedy pass
- recovery/fill pass
- coverage rescue / repair pass
- polish/swap pass when it changes crew-on-flight complement

If a phase is purely per-crew dynamic programming and cannot see global complement state, 8072 should not be pretended as checked there. The hard gate must run during construction/recovery where assignments are actually selected, and post-check remains a final guard.

## Data Requirements

8071 needs:

- rule param rows
- pairing/duty/segment timing
- assignment group and qualifier
- labels and attributes
- base/rank/fleet/team scope
- flight number, destination, and position where available
- roster-period / checked-window context

8072 needs:

- rule param rows
- `CrewOnFlight` fixed/preassigned rows
- candidate crew rows produced from proposed pairings
- `PairingDutySegment`
- pairing composition / planned counts by rank
- filled counts by rank in current complement state
- crew rank / acting rank
- crew assignment and assignment group
- crew nationality
- crew teams
- crew qualifications
- segment fleet, dep, arr, destination country, attributes, composition

Missing required 8072 source data must fail closed by warning plus rejecting 8072 enablement in strict mode. It must not silently mark 8072 as wired.

## Testing Requirements

Required automated coverage:

- PBS rule gate classifies 8071 as `actual_check_functions`.
- PBS rule gate classifies 8072 as `complement_check_functions`.
- PyO3 8071 `check_line` emits a violation when a candidate breaches max roster-property count.
- PyO3 8072 incremental check rejects a second qualified crew when `Max Limits=1`.
- PyO3 8072 incremental check allows an under-min state when open planned slots can still satisfy the minimum.
- PyO3 8072 incremental check rejects an under-min final/full state when no open slot can satisfy the minimum.
- PBS builder maps ro_input `CrewOnFlight`, `PairingDutySegment`, pairing composition, crew qualifications, and 8072 params into the PyO3 payload.
- PBS assignment attempt code calls 8072 before accepting assignments.
- Final post-check still runs and reports zero solver-created 8072 violations in targeted fixtures.

Required verification commands:

- `cargo test --manifest-path rule-engine-rs/Cargo.toml`
- `/home/qianggong/.venv/bin/pytest rule-engine-rs/py/tests -q`
- `PYTHONPATH=pbs-engine /home/qianggong/.venv/bin/pytest pbs-engine/tests/unit/test_rust_rule_gates.py pbs-engine/tests/unit/test_rust_engine_builder_rule_gates.py -q`
- Additional targeted PBS tests added by the implementation plan.

## Non-Goals

- Do not merge PBS and Live/Scenario adapters into one runtime.
- Do not call Live/Scenario `check-*` binaries from PBS solver.
- Do not remove final post-check; it remains a guard, but not the primary 8072 enforcement mechanism.
- Do not silently skip 8072 when a RuleSet enables it.

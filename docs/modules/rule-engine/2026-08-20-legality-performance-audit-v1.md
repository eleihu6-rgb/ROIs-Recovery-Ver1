# Legality Performance Audit v1

Date: 2026-08-20

Scope:
- PBS solver legality calls
- Live legality
- Scenario legality

Goal:
- Find performance headroom without changing rule logic or output rows.

## Confirmed baseline

- `computeViolations()` already wraps the source with `memoizeSource(source)` at [live-server/scripts/legality-recheck-core.mjs:2363-2365](/home/qianggong/Documents/Crew/rois-ai/live-server/scripts/legality-recheck-core.mjs:2363).
- That means per-pass duplicate accessor calls are already deduped across rules.
- This is the right baseline; it is not the main remaining bottleneck.

## Findings

### 1) Scenario legality still has a real table-scan gap

Remote EXPLAIN on scenario `683` showed:
- `scenario.roster_flight` was read by `Parallel Seq Scan`
- 74,644 rows were filtered out per worker
- total time was about `50.9 ms` for one grouped legality read

The same shape on live August used bitmap index intersection and finished in about `23.0 ms`.

Cause:
- Scenario `roster_flight` has no `scenario_id`-leading access path for the hot legality predicates.
- Existing scenario indexes are on `(crew_id, sch_str_dt_utc)`, `(pairing_id, duty_seq, seg_seq)`, and `(scenario_id, live_id)`, but nothing that matches `scenario_id + is_deleted + pairing_id + assignment_group + sch_str_dt_utc`.

Safe improvement:
- Add a scenario-side partial/composite index for legality reads, led by `scenario_id`.
  The first index I would try is `roster_flight (scenario_id, sch_str_dt_utc) where is_deleted = 0`,
  then remeasure before considering a wider compound key.
- This does not change legality logic or output.

### 2) `pairing_segment` is already okay; `roster_flight` is the gap

Remote EXPLAIN on the scenario pairing-segment join used `ix_scen_pairseg` and an indexed lookup on `pairing_segment`.

So the join side is not the problem.
The expensive part is still the `roster_flight` scan.

### 3) `rule_violation` persistence/read path is not the bottleneck

Live `rule_violation` count by ruleset + month was resolved via index-only scan and finished in under `0.1 ms`.
Scenario `rule_violation` count by `scenario_id` also used an index-only scan and finished in about `0.2 ms`.

So storage lookup is fine; the work is upstream in row assembly.

### 4) PBS solver has a behavior-safe optimization gap, but not the obvious one

`RustRuleChecker.bind_problem()` does one baseline `check_line([], crew)` per crew to seed diff signatures.
`solver._run_global_rule_check_round()` then still runs:
- a baseline `check_all()` on empty items
- a candidate `check_all()` on the current round

That is required for current delta semantics, so I would not remove it casually.

The safer PBS follow-up is:
- profile repeated `check_single()` call sites
- look for cheap id-to-index reuse inside the Python checker
- avoid changing round semantics unless parity is proven

## What is already fixed

- Per-pass source memoization is already in place.
- That covers repeated legality-source DB calls across rules.

## Recommendation order

1. Add the scenario `roster_flight` legality index.
2. Re-run scenario legality EXPLAIN and measure wall time again.
3. Only then look at PBS checker micro-optimizations.
4. Keep Live/Scenario source memoization as the baseline, not a follow-up.

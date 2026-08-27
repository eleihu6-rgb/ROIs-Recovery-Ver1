# Rule 8056 pairing bounds = duty report / release

**Status:** Approved (user, 2026-08-18)  
**Grain:** keep one 8056 window per `(crew_id, pairing_id)` (not `duty_seq`).  
**Closes:** out-of-scope item in `2026-08-18-rule-1001-duty-report-release-bounds-design.md`.

## Problem

8056 `flyByPairing` pairing rows use first-flight STD / last-flight STA:

```sql
min(rf.sch_str_dt_utc)   -- first segment departure
max(rf.sch_end_dt_utc)   -- last segment arrival
```

`roster_flight` flying rows store **flight** scheduled dep/arr (`sql/schema/live/02-crew-roster.sql`). Rust `check_roster_spacing` then computes `next.start_utc - current.end_utc`, so the gap is flight-to-flight.

1001 and 7501/7503/7504 (`flyDuties`) already use CARS / PBS PairingDuty **report / release** from `pairing_segment` (`duty_act_*` → `duty_sch_*` → brief / debrief). 8056 must use the same duty bounds so spacing is rest between duties, not between last STA and next STD.

`dep_arp` / `arv_arp` stay on label / airport / location / timezone only; they do not enter the gap.

## Decision

Keep `(crew_id, pairing_id)` grouping. Pairing start/end for 8056 use the same expressions as 1001 / `flyDuties`:

- `start_secs` = `min(dutyStartUtcExpr)` — earliest report / brief in the pairing
- `end_secs` = `max(dutyEndUtcExpr)` — latest release / debrief in the pairing
- `end_rest_secs` stays duty-end + rest (`pairingEndRestSecsSql` with `segmentAlias: 'ps'`)
- Ground / no-`pairing_id` rows stay on `roster_flight.sch_str/sch_end` (those are the task bounds)
- Join `pairing_segment` on `pairing_id` + `duty_seq` (same gate as `flyDuties` / 1001)
- Scenario: `scenario.pairing_segment` then live `pairing_segment` fallback (RO often has empty scenario segments)
- Rust `check-8056` kernel unchanged: still `next.start_utc - current.end_utc`
- Same-`pairing_id` A/B skip in `check_roster_spacing_grouped_app` unchanged
- Live, Scenario, and seed `flyByPairing` stay aligned (§Gantt-Unify)

Reuse `dutyStartUtcExpr` / `dutyEndUtcExpr` the same way `flyDuties` does (`extract(epoch from min/max(...))` aliased `start_secs` / `end_secs`). Do not use the 1001 helpers that alias `end_duty_secs` — 8056 TSV still expects `end_secs`. Do not duplicate a third coalesce chain.

## Loaders

| File | Method |
|------|--------|
| `live-server/scripts/live-legality.mjs` | `flyByPairing` |
| `live-server/scripts/scenario-legality.mjs` | `flyByPairing` |
| `live-server/scripts/scenario-legality-source.mjs` | `flyByPairing` |
| `live-server/scripts/check-8056-spacing.mjs` | live harness (must match persisted pipeline) |

## Tests

- String/SQL capture tests (same style as `assignment-overlap-rosters-sql.test.mjs`): Live / Scenario / seed `flyByPairing` pairing SQL must select duty report/release and must not use `min(rf.sch_str_dt_utc)` / `max(rf.sch_end_dt_utc)` as `start_secs` / `end_secs`.
- Extend `verify:assignment-overlap-sql` or add a sibling EXPLAIN/smoke so generated `flyByPairing` SQL is not mock-only (`docs/modules/database/generated-sql-safety-standard.md`).
- Do not weaken existing 8056 e2e (`legality-recheck-8056-user-story`, `rule-8056-spacing`) unless a selector/message is stale because bounds moved; then update assertions to the new duty-window times (§Stale-Test).

## Out of scope

- Splitting 8056 windows by `duty_seq` (rejected; keep pairing grain)
- Changing Rust TSV columns, gap formula, or persisted `pairing_id` (still the earlier duty)
- 7504 (`flyDuties` already on report/release)
- Solver / `ro_input` pairing times
- Recomputing stored `rule_violation` (needs a legality recheck after deploy)

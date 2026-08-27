# Rule 1001 pairing bounds = duty report / release

**Status:** Approved (user, 2026-08-18)  
**Anchor case:** SIT scenario 718, crew `2496`, pairing `15264` vs 4 Aug DO.

## Problem

1001 `assignmentOverlapRosters` pairing rows used first-flight STD / last-flight STA:

```sql
min(rf.sch_str_dt_utc)   -- first segment departure
max(rf.sch_end_dt_utc)   -- last segment arrival
```

Gantt and 7501/7503/7504 (`flyDuties`) already use duty report / release from `pairing_segment` (`duty_act_*` → `duty_sch_*` → brief / debrief).

Anchor: DO ends `2026-08-05 05:59:59Z` (4 Aug 23:59 YYC). Duty 1 report is `05:50Z` (4 Aug 23:50 YYC) — 10 min overlap. 1001 used STD `06:50Z` and saw a 50 min gap, so it stayed silent.

## Decision

Pairing timeline for 1001 uses the same report/release expressions as `flyDuties`:

- start = `min(dutyStartUtcExpr)` — report / brief
- end_duty = `max(dutyEndUtcExpr)` — release / debrief
- `end_rest_secs` stays duty-end + rest (unchanged helper)
- Ground / DO rows stay on `roster_flight.sch_str/sch_end` (those are the task bounds)
- Rust `check-1001` kernel unchanged
- Scenario: join `scenario.pairing_segment` then live `pairing_segment` (RO often has empty scenario segments)

Live, Scenario, and seed loaders stay aligned (§Gantt-Unify).

## Out of scope

- 8056 `flyByPairing` duty report/release: see `2026-08-18-rule-8056-duty-report-release-bounds-design.md`
- Solver / ro_input pairing times
- Recomputing stored `rule_violation` (needs a legality recheck after deploy)

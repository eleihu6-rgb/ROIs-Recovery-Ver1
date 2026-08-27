# Design: flyDuties use duty start/end (align Live/Scenario with PBS)

**Status:** Approved (user: option A + approach 2)  
**Date:** 2026-08-02  
**Anchor case:** crew `2560`, pairings `15152` + `15279` — Live currently emits no 7504; with duty bounds both duties are WOCL and spacing &lt; 55 RH → 7504 should fire.

## Problem

Live and Scenario legality load FLY work periods via `flyDuties`, which today aggregates **flight** scheduled times from `roster_flight`:

```sql
min(rf.sch_str_dt_utc)  -- first segment flight departure
max(rf.sch_end_dt_utc)  -- last segment flight arrival
```

PBS / CARS and the RO solver use **duty** bounds (brief → debrief) from `pairing_segment` (`duty_act_*` / `duty_sch_*`). Example for pairing `15152` (crew base YVR/YXX, UTC−7 / PDT):

| Bound | UTC | Local (PDT) | In 7503 WOCL (02:00–05:59)? |
|-------|-----|-------------|------------------------------|
| Flight sch start | 13:45 | 06:45 | No |
| Duty sch / brief start | 12:45 | 05:45 | Yes |

Consequence: 7503 WOCL classification and 7504 WOCL spacing (and any 7501 window math that uses the same `flyDuties` edges) diverge from PBS on the same roster. Pairing `15263` still alerts under flight times because its multi-duty structure overlaps WOCL without needing brief; `15152`+`15279` does not — until duty times are used.

Related: `rule-check-data-service` already prefers brief/duty fields for report/release; only the legality `flyDuties` path is wrong.

## Goals / non-goals

**Goals**

- All consumers of `flyDuties` (rules **7501**, **7503**, **7504**) on **Live** and **Scenario** use duty start/end for `start_secs`, `end_secs`, and `day_ord`.
- Align with PBS PairingDuty / CARS: duty includes pre/post flight brief and debrief.
- Single shared SQL expression helper (approach 2) so Live, Scenario, and scenario-source loaders cannot drift.
- Preserve existing grouping (`byDutySeq` vs pairing-level) and `end_rest_secs` wiring for 1001 unless a follow-up finds a hard coupling.

**Non-goals**

- No Rust rule formula changes (WOCL still from 7503 params; 7504 still min RH between consecutive WOCL FLY duties).
- No change to `groundWork()` (non-FLY / ground periods stay on `roster_flight` sch).
- No DB migration; no new columns on `roster_flight`.
- No change to Gantt puck / bar paint times (canvas still uses flight sch); this is legality input only.
- No change to `pairingEndRestSecsSql` / rule 1001 rest window in this workstream (tracked as out of scope; reopen if duty-end vs pairing `sch_end` causes a proven mismatch).

## Approach (scheme 2 — shared duty bound expressions)

Extract reusable SQL fragments (preferred home: extend `live-server/scripts/assignment-overlap-rest-sql.mjs`, or a sibling `duty-bounds-sql.mjs` imported by the three legality loaders).

### Coalesce order (per segment row `ps`, roster row `rf`)

| Edge | Priority |
|------|----------|
| **Start** | `ps.duty_act_str_dt_utc` → `ps.duty_sch_str_dt_utc` → `ps.brief_start_utc` → `rf.sch_str_dt_utc` |
| **End** | `ps.duty_act_end_dt_utc` → `ps.duty_sch_end_dt_utc` → `ps.debrief_end_utc` → `rf.sch_end_dt_utc` |

Rationale:

- Prefer **act** then **sch** duty columns to match PBS `duty_act_*` on PairingDuty when present.
- Brief / debrief cover rows where duty columns are null but CARS brief/debrief exist (same spirit as `rule-check-data-service`).
- Flight sch is last-resort so recheck never drops a FLY duty solely for missing segment times.

### Aggregation in `flyDuties`

Unchanged joins / filters / group keys. Replace only the time expressions:

- `start_secs` = `extract(epoch from min(<dutyStartExpr>))::bigint`
- `end_secs` = `extract(epoch from max(<dutyEndExpr>))::bigint`
- `day_ord` = `floor(extract(epoch from min(<dutyStartExpr>)) / 86400)::bigint`

When `byDutySeq` is true, min/max are within one duty; segment rows for that duty share the same duty bounds. When false (pairing-level), min/max form the outer duty envelope across duties in the pairing — correct for rules that request pairing-level FLY periods.

`order by` clauses that currently sort by `rf.sch_*` for `array_agg` / `string_agg` may stay on flight sch (attribute pick order); only the legality time bounds switch to duty.

### Touch points

| File | Change |
|------|--------|
| `live-server/scripts/assignment-overlap-rest-sql.mjs` (or sibling) | Export `dutyStartUtcExpr` / `dutyEndUtcExpr` (or one helper returning both) |
| `live-server/scripts/live-legality.mjs` | `flyDuties` uses helpers |
| `live-server/scripts/scenario-legality.mjs` | same |
| `live-server/scripts/scenario-legality-source.mjs` | same |
| Tests | Helper unit tests + legality regression for anchor case |

Preview / recheck that go through the same `flyDuties` adapters inherit the fix automatically; no separate preview SQL for FLY duty bounds unless a fork is discovered during implementation.

## Risks / expected behavior changes

- **7501 / 7503 windows may widen slightly** (earlier start / later end by brief+debrief minutes). Expected and desired for CARS alignment.
- **More 7504 hits** where consecutive FLY duties were WOCL only after brief (e.g. `2560` + `15152`/`15279`).
- **Null duty + null brief**: fallback to flight sch → behavior identical to today for that row.
- **Scenario empty segments**: existing left join + coalesce to `rf.sch_*` keeps recheck alive; same pattern as today when segment join misses.

## Success criteria

1. Shared helper is the only place that defines duty start/end coalesce order for legality `flyDuties`.
2. Live + Scenario `flyDuties` SQL no longer use bare `min/max(rf.sch_*_dt_utc)` for `start_secs` / `end_secs` / `day_ord`.
3. Anchor: after fix, assigning / checking crew `2560` with FLY pairings `15152` and `15279` produces a **7504** violation (WOCL spacing), consistent with duty-local WOCL on both sides.
4. Existing non-WOCL FLY duties that remain outside WOCL after duty expansion still do not false-positive 7504.
5. Focused Vitest (and Playwright if UI surface is required for the regression) pass; results pasted per §No-Illusion.

## Relationship to other work

- Orthogonal to 7501 puck paint specs (`2026-08-01-7501-puck-window-all-fly-pairings-design.md`, edit-focus worst window): those change **where** a 7501 row paints; this changes **whether / when** 7501/7503/7504 fire based on duty edges.
- Complements PBS `ro_input` PairingDuty construction (`duty_act_str_dt_utc` / `duty_act_end_dt_utc`) so Live recheck and solver share the same physical meaning of a FLY duty.

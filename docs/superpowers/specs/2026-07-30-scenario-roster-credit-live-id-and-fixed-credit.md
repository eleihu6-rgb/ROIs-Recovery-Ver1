# Scenario Roster Credit `live_id` and Fixed-Credit Fallback

## Goal

After a Scenario optimization finishes, Scenario Gantt roster credit must be accurate enough for
Manday period KPIs:

- Persist optimizer `old_id` into `scenario.roster_flight.live_id`.
- Use `live_id` to copy credit from live `roster_flight.sch_credited_minutes` /
  `act_credited_minutes` for pre-assigned rows that came from Live.
- Ensure optimizer-created CR flying rows get duty credit from `pairing_segment`, deduplicated by duty
  so multi-segment duties do not double count.
- Remove the retired proportional ground-credit fallback from credit calculation; use fixed credit only.

## Current Behavior

`live-server/src/services/scenario/scenario-result-loader.ts`

- `buildRosterRows()` parses input/output gz sections and builds one `scenario.roster_flight` row per
  pairing segment, plus one row per ground item.
- Flying rows currently set `act_credited_minutes` from input `pairing_segment.duty_act_credited_minutes`.
- Ground rows currently write `act_credited_minutes = null` and do not write `sch_credited_minutes`.
- No `live_id` is present in the `RosterRow` type or insert columns.

`live-server/src/services/manday/manday-tool.ts`

- Flying credit is computed per `(crew_id, pairing_id, duty_seq)` using:
  `MAX(COALESCE(rf.act_credited_minutes, ps.duty_credit, 0))`.
  This already avoids counting every segment in the same duty repeatedly.
- Ground rows are passed to Rust with roster actual/scheduled credit first, then assignment fixed fallback.
- Assignment fallback loads `fixed_credit_min` only.

`rule-engine-rs/src/bin/ruletool.rs` / `rule-engine-rs/src/lib.rs`

- For GND rows, ruletool uses roster actual credit, then scheduled credit, then
  `ground_credit(fixed_credit_min)`.
- `ground_credit()` returns fixed credit when present; otherwise 0.

## Proposed Changes

### 1. Schema and models

Add nullable `live_id bigint` to both live and scenario `roster_flight`, keeping mirror parity.

Files:

- `sql/migration/<new>-roster-flight-live-id.sql`
- `sql/schema/live/02-crew-roster.sql`
- `sql/schema/scenario/01-scenario-tables.sql`
- `live-server/src/models/roster/roster-flight.ts`

Index recommendation:

- `create index if not exists idx_roster_flight_live_id on roster_flight (live_id) where live_id is not null;`
- same for `scenario.roster_flight` including `scenario_id` if needed:
  `(scenario_id, live_id) where live_id is not null`.

### 2. Scenario output loader

Extend `RosterRow` with:

- `live_id`
- `sch_credited_minutes`
- `act_credited_minutes`

Mapping:

- Read `old_id` from optimizer output `ROSTER` rows only.
- For flying `ASSIGNMENTS`, use the matching `ROSTER` row keyed by `(crew_id, pairing_id)` and set
  `live_id = ROSTER.old_id` when present.
- For ground `ROSTER`, set `live_id = old_id` when present.
- Batch query live `roster_flight` by those ids inside the loader transaction.
- Fill scenario credit from live when available:
  - `sch_credited_minutes = live.sch_credited_minutes`
  - `act_credited_minutes = live.act_credited_minutes`

Fallbacks:

- For CR flying rows or missing live credit:
  - `act_credited_minutes = pairing_segment.duty_act_credited_minutes`
  - `sch_credited_minutes = pairing_segment.duty_sch_credited_minutes`
    fallback to `duty_act_credited_minutes`
- For CR ground rows:
  - leave roster credit null unless output supplies explicit credit fields in the future.
  - Manday fallback will use assignment `fixed_credit_min`.

### 3. CR flying duty credit

The Manday driver already aggregates flying credit by `(crew_id, pairing_id, duty_seq)` and uses
`MAX(...)`, so the main requirement is to make each `scenario.roster_flight` row carry credit values.
For CR rows, loader should populate segment rows from the duty credit fields. The existing Manday
dedupe prevents multi-segment duties from double-counting.

### 4. Remove proportional credit fallback

Production path must not multiply duty duration by a proportional credit field.

Smallest implementation:

- In `rule-engine-rs::ground_credit`, return:
  - `fixed_credit_min` when it is present and positive or zero.
  - `0` when it is absent.
- In `manday-tool.ts`, stop selecting/passing the retired proportional field; pass `0` in the reserved
  TSV field for compatibility.

Lower-risk option:

- Keep TSV field `a3` for compatibility, but hard-code it to `0` and update comments/tests.
- Remove the retired DB/API/UI field so future code cannot keep using it.

## Tests

Focused tests to add/update:

- Scenario loader unit test:
  - output `old_id` is inserted into `scenario.roster_flight.live_id`.
  - live credit by `old_id` overrides pairing-segment fallback.
  - CR row without `old_id` falls back to duty scheduled/actual credit.
- Manday unit test:
  - generated SQL / mocked `runRust` no longer depends on retired proportional fallback.
- Rust tests:
  - `ground_credit(None) == 0`.
  - `ground_credit(Some(0)) == 0`.
  - ruletool aggregation fixture updated from pct-based credit to fixed-only fallback.

Verification:

- `cd live-server && npx vitest run src/__tests__/services/scenario/scenario-result-service.test.ts src/__tests__/unit/manday-tool-fly-credit-fallback.test.ts`
- `cd rule-engine-rs && cargo test rule_8002_tests ruletool_aggregation`
- `cd live-server && npm run build`

## Open Questions

- Confirmed by user: optimizer output field name is exactly `old_id`; it appears only in `ROSTER`.
- Confirmed by user: `old_id` points to live `roster_flight.id`.

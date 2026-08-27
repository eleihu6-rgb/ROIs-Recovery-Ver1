# RosterGround Credit Integration Design

Date: 2026-07-09

## Goal

Carry ground-duty credit from the F8 RosterGround inbound API through the live roster table, expose it in the optimizer `ro_input.gz`, and make crew-manday calculation prefer roster-level credited minutes over assignment default credit.

The field names are intentionally different at the two boundaries:

- Connector/live inbound JSON uses `credit`.
- Optimizer `RosterGround` output uses `creditedMinutes`.

## Scope

This change covers four connected paths:

1. F8 RosterGround inbound transform and import.
2. `roster_flight` persistence for ground rows.
3. `engine-server` `ro_input` `RosterGround` section.
4. Live/scenario manday calculation via the Rust `ruletool`.

It does not change database schema. The target columns already exist:

- `roster_flight.act_credited_minutes`
- `roster_flight.sch_credited_minutes`

It does not change pairing or flying-duty credit logic.

## Current Behavior

`connector-server` already transforms F8 RosterGround JSON `credit` into `RosterGroundRecord.credit`.

`live-server/src/workers/roster-ground-inbound-worker.ts` inserts non-flight ground rows into `roster_flight` with `pairing_id = NULL` and currently writes `act_credited_minutes` from `rec.credit`. It does not write `sch_credited_minutes`.

`engine-server/F8/ro_input_builder/sections/roster.py` exports `RosterGround` rows from `roster_flight`. It currently includes `dpMin = act_credited_minutes`, but does not include a `creditedMinutes` column.

`live-server/src/services/manday/manday-tool.ts` currently calculates ground credit from `assignment.fixed_credit_min` and `assignment.credit_pct`, then sends that model to `rule-engine-rs` `ruletool`.

## Proposed Design

### 1. Inbound Transform

Keep the connector inbound contract as `credit`.

`transformF8RosterGround` should continue mapping:

```text
raw.credit -> RosterGroundRecord.credit
```

Tests should explicitly assert this mapping, because the downstream behavior depends on it.

### 2. Roster Persistence

When importing non-flight RosterGround records, write the same inbound credit into both schedule and actual credit columns:

```text
roster_flight.act_credited_minutes = rec.credit
roster_flight.sch_credited_minutes = rec.credit
```

This keeps the requested fallback chain meaningful even when F8 supplies only one `credit` value.

Existing idempotency and replacement behavior stays unchanged:

- Delete import-owned F8 ground rows in the sync window.
- Delete exact incoming keys for boundary-crossing rows.
- Insert the incoming ground rows as `pairing_id IS NULL`.

### 3. Optimizer ro_input RosterGround

Add `creditedMinutes` to the `RosterGround` section output.

Source column:

```text
creditedMinutes = roster_flight.act_credited_minutes
```

This follows the user-facing optimizer contract: `RosterGround.creditedMinutes` corresponds to `roster_flight.act_credited_minutes`.

The existing `dpMin = act_credited_minutes` column can remain for compatibility unless tests or consumers show that the header must remove it. The implementation should update the roster section tests that compare headers against the current expected contract.

### 4. Manday Credit Priority

Ground manday calculation should prefer roster-level credited minutes in this order:

1. `roster_flight.act_credited_minutes`
2. `roster_flight.sch_credited_minutes`
3. `assignment.fixed_credit_min`
4. `assignment.credit_pct * duty_minutes`

The live-server manday driver should load ground rows with both credited-minute columns. It should pass an explicit ground-credit override to Rust when either roster credit column has a value.

Rust `ruletool` should remain backward compatible with the current 8-column TSV format. The new format should append optional fields rather than repurpose the existing positions:

Current columns:

```text
crew, division, local_date, kind, a1, a2, a3, flag
```

For GND rows, append:

```text
act_credit_minutes, sch_credit_minutes
```

Rust behavior for GND:

```text
if act_credit_minutes is present and numeric:
  credit = act_credit_minutes
else if sch_credit_minutes is present and numeric:
  credit = sch_credit_minutes
else:
  credit = ground_credit(fixed_credit_min, credit_pct, duty_minutes)
```

For FLY rows, existing behavior is unchanged.

### 5. Tests

Minimum verification scope:

- `connector-server` unit test for `transformF8RosterGround` mapping `credit`.
- `live-server` unit test for `processRosterGroundImportJob` confirming both `act_credited_minutes` and `sch_credited_minutes` are inserted for ground rows.
- `engine-server` roster ro_input section test confirming `RosterGround` includes `creditedMinutes` and reads it from `act_credited_minutes`.
- `rule-engine-rs` `ruletool` test confirming GND credit priority:
  - actual credit wins over scheduled credit.
  - scheduled credit wins over assignment fixed credit.
  - assignment fixed credit remains fallback.
- `live-server` manday-tool focused test or existing Rust-spawn test update confirming the TSV includes the roster credit override for ground rows.

Final implementation verification should run the smallest relevant commands first:

```bash
npm --prefix connector-server test -- transform-roster-ground-db
npm --prefix live-server test -- roster-ground-inbound-worker
pytest engine-server/tests/test_ro_input_roster_sections.py
cargo test --manifest-path rule-engine-rs/Cargo.toml ruletool
```

Exact commands may need adjustment to match package scripts discovered during implementation.

## Risks

- Header-based golden tests may fail when adding `RosterGround.creditedMinutes`. Those tests should be updated to the new contract, not weakened.
- If any optimizer consumer assumes the old `RosterGround` column count, it must be updated together with the header change.
- Ground tasks spanning multiple local dates are still represented as one roster row and one local-date contribution in the current manday driver. This design does not change that behavior.
- Zero is a valid credit value. The fallback should distinguish missing/null from `0`; it must not treat zero as absent.

## Acceptance Criteria

- F8 RosterGround API `credit` is persisted to both `roster_flight.act_credited_minutes` and `roster_flight.sch_credited_minutes`.
- `ro_input.gz` `RosterGround` emits `creditedMinutes` from `act_credited_minutes`.
- Ground manday uses roster actual credit first, roster scheduled credit second, assignment fixed credit third, and assignment percent fallback last.
- Existing flying credit behavior is unchanged.
- Focused tests pass and final delivery reports exact PASS/FAIL command results.

# Rule 8030 Message — Show flt_num, Group by flightId

Date: 2026-08-21

## Goal

Planner-facing 8030 text shows **flight number** (e.g. `Flight 605`), not internal `flt_id` (e.g. `77370`). Confirm-dialog aggregation stays keyed by physical **`flightId`**.

## Contract

- **Display:** `Pilot aged {age} on flight {flt_num} carrying …` → confirm shared text `Flight {flt_num} carrying …`.
- **Fallback label:** if `flt_num` empty, use `String(flt_id)`.
- **COF / first-flight filter:** unchanged — physical `flt_id`.
- **Confirm grouping key:** `ruleCode` + `ruleName` + row prefix + **`flightId`** (not parsed from message).
- **Preview / `RuleViolation`:** optional `flightId: number | null` for 8030 (and any future flight-grain rules).

## Scope

- `pilotAge()` live + scenario: select `flt_num` alongside `flt_id`.
- `rule8030` in `legality-recheck-core.mjs`: message uses `flt_num`; emit `flight_id` on violation rows.
- Preview normalize + gantt `toRuleViolation` + `groupRuleConfirmViolations`.
- Unit tests + update confirm-group / e2e mocks to `flt_num` text + `flightId`.

## Non-goals

- Persisted `rule_violation` schema column for `flight_id`.
- Rust `check-8030` TSV shape change.
- Grouping by `flt_num`.

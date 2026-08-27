# Rule 8030 Message — Local Departure Date

Date: 2026-08-21

## Goal

8030 planner text includes the flight’s **local departure calendar date** in the departure airport timezone:

`Row 1: Flight 605 (2026-09-07) carrying 2 crew aged 60+ (limit 1).`

## Contract

- **Instant:** `coalesce(flight.sch_dep_dt_utc, pairing_segment.sch_str_dt_utc, roster_flight.sch_str_dt_utc)`.
- **Timezone:** `airport.zone_id` for that flight’s `dep_arp`; if missing/blank → **UTC**.
- **Format:** `localDateOf(epochSecs, zoneId)` → `YYYY-MM-DD` inside parentheses after `flt_num`.
- **Fallback label:** empty `flt_num` still falls back to `flt_id`; date still appended when instant exists.
- **Confirm dialog:** group by structured `flightId` (unchanged); shared message keeps `(date)`; parse regex updated.
- **COF / first-flight filter:** unchanged.

## Scope

- `pilotAge()` live + scenario: emit dep epoch + dep zone (via flight/segment dep + airport join).
- `format8030ViolationMessage` / `rule8030` message builder.
- Gantt `rule-confirm-groups` parse + unit tests.

## Non-goals

- Schema changes; Rust `check-8030` TSV; grouping by date.

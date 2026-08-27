# Scenario Scheduled Time Fallback

## Problem

Scenario data can inherit `pairing_segment.sch_*` values that are actually
execution times. The linked `flight.sch_dep_dt_utc` and `flight.sch_arv_dt_utc`
are the authoritative scheduled timestamps, but Scenario currently does not
apply that relationship consistently.

## Design

- Read `sch_*` directly from `pairing_segment.sch_*`; Scenario does not join
  `flight` for this correction.
- Read `act_*` directly from `pairing_segment.act_*` and carry those fields
  through the Scenario Gantt contract and optimizer roster transcription.
- On the frontend, use actual timestamps when present and fall back to
  scheduled timestamps only for legacy payloads that do not contain `act_*`.

## Verification

- Unit regression for `buildRosterRows`.
- Snapshot/GZ regression for segment schedule overlay.
- DB query/mapping regression for flight schedule join and fallback.

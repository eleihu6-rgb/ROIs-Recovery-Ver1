# Live same-flt_id COF mates for 8030 + 8072

Date: 2026-08-20

## Goal

Make Scenario legality and PBS Solver see **all Live FLY crew on the same physical `flt_id`**, including other bases and **both Pilot (P) and Cabin (C)**, for:

- **8030** Pilot Age (over-age count per flight)
- **8072** min/max qualified crew on segment / flight

without persisting those mates into `scenario.roster_flight`.

## Problem

Scenario filters (e.g. YYZ-only) omit Live assignees on shared flights (e.g. YUL 1012 on the same 605 as YYZ pairing). Today:

- Scenario `pilotAge` / 8072 filled read mostly `scenario.roster_flight` (pairing-local, often P-only).
- `ro_input` `CrewOnFlight` is division-scoped.
- PyO3 mutable COF (`crew_on_flight_8030`, `crew_on_segment_8072`) initializes from optimizer fixed-roster invert, missing Live mates.

## Decisions

1. **No persist** of COF mates into `scenario.roster_flight`. Gantt / save / PBS result write-back unchanged.
2. **CrewOnFlight is division-agnostic** (P+C on flight pool for every scenario).
3. **Scenario legality:** read-time `scenario ∪ live` by `flt_id`, dedupe `(flt_id, crew_id)`.
4. **PBS:** initialize both mutable COFs from `CrewOnFlight` (+ Crew COF attrs); keep `can_add` / `commit` / `rollback`.
5. **8030** still filters over-age by Age Define division; **8072** sees full on-flight team (P+C).

## Non-goals

- Changing Age Define / Max Number / 8072 plan values.
- Expanding optimizer `problem.crews` beyond scenario filter.
- Auto-inserting Live mates when writing solver results into the scenario.

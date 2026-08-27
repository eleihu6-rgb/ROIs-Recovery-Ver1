# Rule 8030 Segment Grain (supersedes pairing-level COF)

Date: 2026-08-20

## Goal

Make **8030 (Pilot Age)** evaluate crew-on-flight (COF) at **`flt_id` (physical flight / segment)** grain across the full legality stack — Rust kernel, `check-8030`, Live/Scenario recheck, PBS complement gate, and Gantt draft preview — matching C++ `rule8030.cpp` (`crewsOnFlt[segment->getDBId()]`) and the same grain spirit as **8072**.

This **supersedes** the Grain / Non-goals sections of
[`2026-07-30-rule-8030-dynamic-complement-gate-design.md`](./2026-07-30-rule-8030-dynamic-complement-gate-design.md),
which documented pairing-level COF and explicitly deferred C++ per-`flt_id`.

## Problem

Pairing-level aggregation misses the real world case: the **same `flt_id` can appear on different pairings**. Two ≥ Age Define pilots on different pairings that share one flight never merge into one count, so 8030 stays silent.

## Contract

Violation when Division matches and:

`count(division == DIV && age(at segment_start) ≥ Age Define) > Max Number` (strict `>`)

- **COF key:** `flt_id` (not `pairing_id`, not `pairing_segment.id`).
- **Attribution:** each violation still attaches to the **evaluated crew’s own** `pairing_id` (C++ style) and carries `flight_id` for localization.
- **Age instant:** that segment’s start (not whole-pairing earliest start).
- **Missing `flt_id`:** `coalesce(rf.flt_id, ps.flt_id)`; if still null, use a non-merging local key so rows never falsely merge across pairings (and cannot claim cross-pairing detection).

Counting / Max Number / Division params are unchanged.

## Design by surface

### Rust kernel + CLI

- `AgeFlight` / `AgeViolation` gain `flight_id`; `pairing_id` remains attribution.
- `check-8030` stdin TSV: `flt_id \t pairing_id \t start_date \t crew_id \t division \t birth_date`, grouped by `flt_id`.
- `--emit-tsv` includes `flt_id`.

### PBS / PyO3

- Replace `crew_on_pairing_8030` with **`crew_on_flight_8030`** keyed by flight index.
- Inject `pairing → [flt_idx…]` at Engine construct.
- Public `can_add_pairing_8030` / `commit` / `rollback` stay pairing-shaped for the solver; internally fan out to every flight on that pairing.

### Live / Scenario recheck

- `pilotAge()` emits distinct `(flt_id, crew)` across all pairings sharing the flight.
- Persist / preview messages may reference flight; time window = segment span.

### Gantt draft preview

- Seed temp roster mates by **touched `flt_id` set** (including other pairings), not only same `pairing_id`.
- Frontend expands draft affected crews by shared `fltId` mates.

## Non-goals

- Full C++ filter parity (Airport / Acting Ranks / Dir / Composition / Assignment Group).
- Ground-duty branch.
- Changing Age Define / Max Number business values.

## Verification

- Rust: same-flight different-pairing → over-age count merges and fires.
- PyO3 complement: commit on pairing A blocks second over-age on pairing B sharing a flight.
- Node recheck unit + Playwright: Alert/bell shows 8030 for the cross-pairing case.

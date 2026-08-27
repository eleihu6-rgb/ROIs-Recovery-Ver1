# Rule 8072 CTE Materialize — planner nested-loop blowup

## Problem

`idx_crew_team_crew_id` is live (Bitmap Index Scan, ~0.01s). It is not the 8072 hotspot.

`qualificationFlightSegments` CTEs `crew_rows` / `crews` / `planned` / `filled` are estimated as **1 row**. The planner then nested-loops LATERAL `flight_composition` / `pairing_composition` and per-segment crew aggregations ~3227×3227 ≈ 10.4M times (~52M+31M buffer hits, ~99s).

Materializing only one CTE is not enough (`planned` only ~59.8s, `crews` only ~38.8s). All four together ≈ 34× (~4s). Pilot-division full legality ~115s → ~20s.

`AS MATERIALIZED` is a PostgreSQL 12+ planner hint. This query has no volatile functions. Result rows stay byte-identical (sha256, including sort).

## Change

Add `as materialized` to those four CTEs in the three isomorphic loaders. Leave `seg` inlined.

## Out of scope

- Extra indexes
- Rewriting LATERAL to joins
- Rust `check-8072`, TSV layout, `rule8072` mapping in `legality-recheck-core.mjs`
- Auto-recompute stored 8072 rows
- CI `EXPLAIN ANALYZE` (too expensive; use `EXPLAIN` + `CTE Scan` assertions)

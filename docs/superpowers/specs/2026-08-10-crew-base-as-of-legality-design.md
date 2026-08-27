# Design: date-effective crew_base for legality offsets

> **Superseded (2026-08-21):** Single `asOf = window start` per recheck is withdrawn.  
> Active design: [`2026-08-21-crew-base-timeline-legality-design.md`](./2026-08-21-crew-base-timeline-legality-design.md) (per-instant / per-day timeline).

**Date:** 2026-08-10  
**Status:** Superseded  
**Scope:** `crewOffsets` / `crewBaseTimezone` in live + scenario legality sources

## Problem

Crew 2314 has two `is_prime_base=1` rows: YYC through 2026-11-30, YYZ from 2026-12-01. Legality picked the latest `eff_dt` prime (future YYZ, UTC−4). August DO rows are stored on YYC day bounds (06:00Z). 7508 then reported SDFD=0 for 2026-08-01..08 because rest did not cover YYZ-local midnights (04:00Z).

## Decision

Resolve base **as of the legality window start** (`ctx.dateFrom` / live `fromIso` date):

1. Prefer rows with `eff_dt::date <= asOf` and (`exp_dt` null or `exp_dt::date >= asOf`)
2. Then `is_prime_base desc`, `eff_dt desc`
3. Shared pure picker + SQL `ORDER BY` so live / scenario / scenario-legality-source stay aligned

## Non-goals

- Changing DO storage timestamps
- Per-duty base switching inside one recheck (single asOf per run)
- Rewriting standalone CLI `check-7501` scripts in this change (same pattern later if needed)

# Design: crew_base timeline for legality offsets

**Date:** 2026-08-21  
**Status:** Implemented (branch `feat/legality/crew-base-timeline`; UAT 7508 crew 755 Row2 cleared 2026-08-21)  
**Scope:** Live + Scenario legality sources and all calendar / offset-fed rules in `legality-recheck-core.mjs`  
**Supersedes:** `docs/superpowers/specs/2026-08-10-crew-base-as-of-legality-design.md` (single `asOf = window start` per recheck)

## Problem

`crewOffsets()` / `crewBaseTimezone()` resolve one base per crew using **recheck window start** (`fromIso` / `ctx.dateFrom`). That fixed “future prime base steals current month” (crew 2314 / YYC vs future YYZ), but breaks crews who **change base inside the recheck span**.

Example (UAT crew **755**):

| Period | Effective base | Static offset |
|--------|----------------|---------------|
| … → 2026-06-30 | YYZ | −240 |
| 2026-07-01 → … | YEG | −360 |

A full recheck with `from=2026-06-01` locks offset to **YYZ**. August DO rows are stored on **YEG** day bounds (`06:01Z`–next `06:00Z`). Rule **7508** then treats most DO days as not covering the (wrong) local midnight, counts **SDFD=1** in 672 RH, and falsely requires ≥4.

Same root cause affects every rule that feeds bin `base_offset` or slices **crew-base-local calendar days** from `crewOffsets()`.

## Goals

- Resolve base/offset/timezone at the **relevant instant** (duty start or calendar day under evaluation), using the same `eff/exp` + prime ranking as `pickEffectiveCrewBase`.
- Cover **all** legality paths that depend on base-local days or `crewOffsets()` (not 7508-only): 7501, 7503, 7504, 7505, 7506, 7507, 7508, 7305 fallbacks, and 1001 if it uses offsets for day bounds; align 8002/8056 message timezones when they use `crewBaseTimezone()`.
- One timeline API shared by **live** and **scenario** sources.
- Regressions: 755 August 7508 Row2 (672/4) clears under YEG; 2314 August still uses YYC (−360), not future YYZ.

## Non-goals

- Changing DO/RES stored timestamps.
- Changing 7508 SDFD business definition (two local nights, rest cover, RES=work, etc.).
- Replacing `BASE_OFFSET_MIN` with full IANA DST tables (keep static airport→offset map).
- PBS optimizer-only runners in this change (follow-up if they duplicate the old asOf).

## Decision (Approach B)

Introduce a **crew_base timeline** and resolve offset/zone **per UTC instant** (or per as-of day). Keep `pickEffectiveCrewBase(rows, asOfDay)` as the single-day kernel.

### Shared helpers (`legality-recheck-core.mjs`)

| Helper | Role |
|--------|------|
| `pickEffectiveCrewBase(rows, asOfDay)` | Unchanged single-day picker |
| `buildCrewBaseTimeline(rows)` | `Map<crewId, Segment[]>` with `{ effDay, expDay\|null, base, isPrime }` |
| `resolveBaseAt(timeline, crewId, asOfDay)` | Base code at day |
| `resolveOffsetAt(timeline, crewId, asOfDay)` | Via `BASE_OFFSET_MIN` |
| `resolveZoneAt(...)` | IANA via airport `zone_id` map |
| Instant helper | Map `utcSecs` → as-of day for resolve (stable algorithm; unit-tested for 755/2314) |

### Source contract (live + scenario)

- `crewBaseTimeline()` — load `crew_base` (+ airport zones) once per source lifetime / recheck.
- `resolveCrewOffset(crewId, utcSecs)` / `resolveCrewTimezone(crewId, utcSecs)` — thin wrappers over the timeline.
- `crewOffsets()` / `crewBaseTimezone()` — **legacy fallback only**: one entry per crew at **window midpoint** date `(from+to)/2`, documented as deprecated for calendar rules. Calendar / D-line paths must call `resolve*`.

### Rule emitters

- For each duty (or ground) row written to a bin: set `base_offset` (and start/end ref when not taken from `duty_ref_tz`) via `resolveCrewOffset(crew, dutyStartUtc)`.
- Prefer existing per-row `duty_ref_tz` / `duty_end_ref_tz` when present (unchanged precedence).
- Violation message formatting that uses base TZ: resolve at **window start** or triggering duty start (not window-start base locked at recheck `from`).

### Rules in scope

| Rule | Change |
|------|--------|
| 7508 | D-line offsets + message zone via resolve |
| 7501 | Same pattern |
| 7503 / 7504 | Local-day / offset via resolve |
| 7505 / 7507 | RP / GDO local days via resolve |
| 7506 | Local check-in day via resolve |
| 7305 | Replace `crewOffsets()` fallback with resolve |
| 1001 | If offset used for day bounds, same |
| 8002 / 8056 | Timezone map via timeline resolve (message accuracy) |

### Docs

- This file is the active design.
- Mark `2026-08-10-crew-base-as-of-legality-design.md` as **Superseded** with a pointer here (single-asOf-per-run is withdrawn).

## Testing

1. **Unit:** timeline + `resolveOffsetAt` — 755 (YYZ through 2026-06-30, YEG from 2026-07-01); 2314 (future YYZ must not win in August).
2. **7508 fixture:** YEG-encoded DO + recheck `from=2026-06-01` → no false 672/4; injecting YYZ-only offset still reproduces the old bug (guard).
3. **2314 regression:** August as-of still YYC / −360.
4. Update existing crew-base-as-of / legality-recheck-core tests for midpoint legacy `crewOffsets()` behavior.

## Acceptance

- UAT: after deploy + 7508 recheck, crew **755** no longer has Row2 `Single day free from duty (1) must be at least 4 in 672 RH (2026-08-09 … 2026-09-06)`.
- Recheck now does not mass-produce SDFD false positives from wrong locked base.

## Risks

- Midpoint legacy `crewOffsets()` can still be wrong for callers not migrated — mitigate by grepping core for `crewOffsets()` and migrating all calendar paths in the same PR.
- Static `BASE_OFFSET_MIN` ignores DST transitions; out of scope (same as today).

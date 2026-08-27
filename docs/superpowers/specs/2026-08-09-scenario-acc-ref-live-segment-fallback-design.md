# Scenario Acc-Ref Live Segment Fallback Design

**Date:** 2026-08-09  
**Status:** approved for implementation (user confirmed after root-cause report)  
**Goal:** Stop Scenario legality preview / recheck from writing `duty_ref_tz = 0` (UTC) when pairings are live-backed, which falsely marks daytime-ending duties as WOCL and fires rule 7504.

## Background

Scenario 718 assigns live pairing 15461 (`pairing_scenario_id = 0`). There are no rows in `scenario.pairing_segment`. Preview inserts roster rows without `dep_arp` / `arv_arp`, then `recalculatePreviewAccRefTz` joins only scenario segments → airports missing → zone defaults to `UTC` → `duty_ref_tz = 0`.

`flyDuties` already falls back to live `pairing_segment` for duty times, so 7504 receives correct epochs but `offset_min = 0`. WOCL is evaluated in UTC; duty ends at `04:40Z` look like WOCL (`02:00–05:59`) even though YYC local end is `22:40`.

Proven with `check-7504`: offset `0` → violations; offset `-360` / proper acc-ref → none.

## Scope

- `live-server/scripts/acc-ref-tz.mjs` — optional live segment join in `loadAccRefRows`
- Wire live fallback from Scenario preview (`legality-preview.ts`) and Scenario recheck (`scenario-legality.mjs`)
- Mirror the same fallback in `src/services/rule-check/acc-ref-tz-service.ts` (scenario result loader path)
- Regression test: empty scenario segments still resolve YYC/YYZ zones (not UTC)

## Non-Goals

- No change to rule 7504 / WOCL window parameters
- No change to Live acc-ref (already joins live segments)
- No backfill of historical `duty_ref_tz` rows (recompute on next preview/recheck)

## Design

Add optional `livePairingSegmentTable` to `loadAccRefRows`. When set, left-join live segments on `(pairing_id, duty_seq, seg_seq)` and coalesce airports:

`rf.dep_arp → ps.dep_arp → lps.dep_arp` (same for arv).

Scenario callers pass live `pairing_segment`; Live callers omit it.

## Validation

- Unit/string or mocked DB test that the SQL / options include live fallback for scenario
- Focused node test: with empty scenario segments + live segments, resolved zones are not UTC for pairing 15461-shaped rows (mock join result or SQL shape assertion + buildAccRefUpdates with UTC vs airport zones)
- `node --test` on touched test file; report PASS

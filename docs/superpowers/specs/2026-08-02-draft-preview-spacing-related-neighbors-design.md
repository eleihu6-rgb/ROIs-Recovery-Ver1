# Design: Draft legality preview — related set includes spacing gap neighbors

**Status:** Approved (user: scheme 1 + scope B — 7504 and 8056)  
**Date:** 2026-08-02  
**Anchor:** Assign pairing `15152` then `15279` to crew `1318` (both WOCL duty starts 05:45 YVR; rest gap &lt; 55 RH). Engine emits 7504 with `pairing_id` = **earlier** pairing (`15152`); preview related set was only `{15279}` → dialog filtered the hit.

## Problem

`checkLiveDraftLegality` keeps only “new + related” preview violations. Related today means:

1. `v.pairingId ∈ relatedPairingIds` (callers usually pass the **edited** pairing only), or  
2. `start_dt`/`end_dt` overlaps `relatedItems` time windows (strict `end > w.start`).

Spacing rules (**7504**, **8056**) persist / emit:

- `pairing_id` = **earlier** (gap-start) duty’s pairing  
- `start_dt`/`end_dt` = rest **gap** (earlier duty end → later duty start)

So when the planner assigns the **later** pairing, the violation anchors on the **earlier** id and the gap only *touches* the later duty at an endpoint. The confirm dialog drops a real new 7504/8056 hit. Period rules 7505/7507 already bypass this via an explicit allow-list; spacing does not.

## Goals / non-goals

**Goals**

- When filtering draft preview results, the **related pairing set** used for spacing rules includes both **chronological FLY neighbors** of each already-related FLY pairing (previous and next FLY pairing of the same crew in `afterItems`).
- Applies to spacing rule codes **7504** and **8056** (scope B). Same helper; extend the code list later if another spacing rule shares the earlier-pairing + gap-window shape.
- Live draft assign path for crew `1318` + `15152`/`15279` surfaces the new 7504 confirm (and session-relevant UX that depends on `relevantNewViolations`).
- Unrelated historical violations still suppressed.

**Non-goals**

- No change to Rust `check-7504` / `check-8056` TSV columns or which pairing is the persisted anchor.
- No change to 7505/7507 special-casing.
- No backend `next_pairing_id` field in this workstream.
- No change to full Live recheck persistence (only draft preview related filtering).

## Approach (scheme 1)

In `gantt/src/stores/roster-store.ts` inside `checkLiveDraftLegality`:

1. Build the initial `relatedPairingIds` set as today (options + relatedItems’ pairing ids).  
2. Call `expandRelatedWithNeighborFlyPairings(relatedPairingIds, afterItems)` → `spacingRelatedPairingIds`.  
3. In `isRelated`:
   - Keep 7505/7507 always-related behavior.  
   - For **7504** and **8056**, test membership against **`spacingRelatedPairingIds`**.  
   - All other rules keep using the unexpanded `relatedPairingIds` (plus existing window overlap).

### Neighbor expansion rules

For each crew that appears on at least one `afterItems` row whose `pairingId` is in the seed related set:

1. Collect distinct FLY pairings for that crew: any `afterItems` row with `assignmentGroup === 'FLY'` and non-null `pairingId`.  
2. Order by earliest `schStrDtUtc` among that pairing’s rows (stable tie-break by pairing id).  
3. For each seed-related pairing that appears in that ordered list, add the **immediate previous** and **immediate next** FLY pairing ids (if any) into the expanded set.  
4. Seed ids remain in the set.

Non-FLY related seeds do not pull FLY neighbors (spacing FLY↔FLY is the target). Missing/invalid times skip that pairing in the sort (do not invent neighbors).

### Window overlap

Leave `overlapsRelatedWindow` as-is for non-spacing rules. Spacing membership after expansion is the primary fix; optional inclusive endpoint tweak is **out of scope** unless a follow-up finds residual misses.

## Touch points

| Area | Change |
|------|--------|
| `gantt/src/stores/roster-store.ts` | Export/helper `expandRelatedWithNeighborFlyPairings`; wire into `isRelated` for 7504/8056 |
| `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts` | Unit: neighbor expand; 7504 earlier-anchor + related=`[later]` shows dialog; unrelated history still hidden; 8056 same shape if cheap |

## Success criteria

1. Assign-later shape: `relatedPairingIds: [15279]`, new violation `{ ruleCode: '7504', pairingId: 15152, ... }` → included in `relevantNewViolations` / confirm dialog.  
2. Historical unrelated `{ pairingId: 999, ... }` still excluded when not a neighbor of the seed set.  
3. 7505/7507 behavior unchanged.  
4. Focused Vitest PASS receipt pasted (§No-Illusion). Playwright only if a stable Live assign fixture is available; otherwise unit coverage is the gate for this filter-only change.

## Relationship

- Complements `2026-08-02-flyduties-duty-bounds-design.md` (engine input times). This spec only fixes **which** engine hits the draft UI keeps after assign.
- Orthogonal to puck paint / Alert Center persistence after Save + full recheck.

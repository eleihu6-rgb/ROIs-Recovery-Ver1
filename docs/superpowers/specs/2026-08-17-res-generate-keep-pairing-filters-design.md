# RES generate: do not auto-apply assignment filters

**Date:** 2026-08-17  
**Status:** Approved (design)  
**Scope:** Live Gantt — RES Pairing Creator Generate success path  
**Related:** `docs/superpowers/specs/2026-06-23-res-pairing-creator-design.md` § post-generate filter chips; skill 128

## 1. Problem

After Generate in RES Pairing Creator, Pairing pane condition chips gain the generated assignment codes (PRAM / PRMM / PRPM, or CRAM / CRPM). Users already have other filters (e.g. base YYZ) and want those **unchanged**.

## 2. Root cause

`gantt/src/components/res-pairing/review-generate.tsx` `handleGenerate` on success:

```ts
useFilterStore.getState().setPairingFilter({ assignments: codes })
await applyGanttFilters()
```

This **replaces** pairing assignment filter with the generated codes.

## 3. Goal

- After Generate, pairing filters (including assignment chips) stay **exactly as before Generate**.
- Newly created pairings still appear if they match the **existing** applied filters (refresh under current query).
- Result banner / created count unchanged.

## 4. Non-goals

- No change to generate API, conflict policy, or dialog UI besides this side effect.
- Users can still set assignment filters manually in the Filter dialog.

## 5. Approach (chosen)

Remove `setPairingFilter({ assignments: codes })`. Keep `applyGanttFilters()` so the pairing pane refetches with the current snapshot.

Rejected: skip refetch entirely (list can stay stale); add a preference toggle (YAGNI).

This **overrides** the original 2026-06-23 spec “post-success filter chips = generated codes.” That auto-filter is no longer desired.

## 6. Implementation

**File:** `gantt/src/components/res-pairing/review-generate.tsx`

Delete the `setPairingFilter` line. Keep `codes` if still used in `setLastResult`; otherwise drop unused `codes` only if `lastResult.codes` is unused by the banner (check before deleting).

## 7. Testing

| Layer | Assertion |
|-------|-----------|
| Playwright update | `e2e/tests/gantt/res-pairing-yvr-acceptance.spec.ts` — stop requiring `pairing-filter-chip-PRAM` / `PRPM` after Generate; assert those chips are **absent** unless they were already applied (test starts without assignment chips → expect count 0) |
| Playwright update | `e2e/tests/gantt/res-pairing-yyz-cabin-acceptance.spec.ts` — same for CRAM/CRPM |
| Playwright (if present) | Live-1404 or dialog spec that asserts auto chips — update the same way |
| Keep | Generate still creates pairings; labels / counts in acceptance tests remain |

## 8. Acceptance

Generate RES pairings with an existing pairing filter (e.g. YYZ only): after close, chips still only YYZ — no PRAM/PRMM/PRPM chips added.

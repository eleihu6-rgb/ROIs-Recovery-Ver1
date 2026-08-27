# Scenario draft legality align with Live — Design

**Date:** 2026-08-03  
**Status:** Approved (approach A)  
**Problem:** Scenario pairing→crew drag appears to do nothing after drop.

## Root cause

`previewScenarioPatch` in `scenario-edit-controller.ts` gates with:

```ts
return result.allowed && await showConfirmDialog(...)
```

When `preview-draft` returns `allowed: false` (any severity≥2 on the crew’s after-roster), JS short-circuits: **no confirm dialog**, **no `addPatch`**. Pre-existing lead-in violations (e.g. rule 1001 on unrelated pairings) therefore silently block every assign.

Live (`checkLiveDraftLegality`) instead:

1. Runs before + after preview
2. Keeps only **new + edit-related** violations (plus always-surface 7505/7507)
3. Always shows confirm when that list is non-empty
4. Applies only if `!hasBlocking && proceed`

## Decision

**Approach A:** Scenario uses the same draft-legality semantics as Live.

## Design

1. Extend `checkLiveDraftLegality` options with `contextType?: 'live' | 'scenario'` (default `'live'`) and `scenarioId?: number`, and pass them through to `legalityPreviewApi.checkDraft`.
2. `previewScenarioPatch` builds **before** items from current `pendingChanges` and **after** items including the candidate patch, then calls `checkLiveDraftLegality` with `contextType: 'scenario'`, `scenarioId`, and `relatedPairingIds` / `relatedItems` for the patched pairing.
3. Remove the Scenario-only short-circuit gate; do not invent a second filter.
4. Regression tests: unrelated hard violations must not block assign; related soft violations still open confirm; related hard still block.

## Out of scope

- Changing Rust preview severity / seed lead-in data
- Changing Live dialog UX beyond shared option plumbing
- Scenario lock / capability gates (unchanged)

## Success

Dragging a pairing onto a lock-owned RO scenario crew applies the patch when the only hard violations are pre-existing and unrelated; related new soft violations show the confirm dialog.

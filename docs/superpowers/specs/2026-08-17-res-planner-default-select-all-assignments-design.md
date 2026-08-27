# RES Planner: default-select all division assignments

**Date:** 2026-08-17  
**Status:** Approved (design)  
**Scope:** Live Gantt — RES Pairing Creator (Define tab)  
**Related:** `docs/superpowers/specs/2026-07-13-res-planner-assignment-multi-select-design.md`, skill 128

## 1. Problem

On Define → ASSIGNMENTS (MULTI-SELECT), Pilot options are PRAM / PRPM / PRMM. PRAM and PRMM open selected; **PRPM does not**. Users expect all three selected by default (same as “select every call type for this division”).

## 2. Root cause

`gantt/src/stores/res-planner-store.ts` still defaults with **first 2** codes (`slice(0, 2)` / `Math.min(2, …)`), a leftover from the AM/PM (2-option) model. Pilot now has 3 `RES_CALL_TYPE` options, so PRPM is omitted.

Affected sites:

| Site | Current behavior |
|------|------------------|
| Initial `selectedAssignments` | `FALLBACK_CALL_OPTIONS.P.slice(0, 2)` |
| `setDivision` | `defaults.slice(0, Math.min(2, defaults.length))` |
| `setCallOptions` fallback when selection empty | `codes.slice(0, Math.min(2, codes.length))` |

## 3. Goal

- **Pilot:** default selected = all call options for P (PRAM, PRMM, PRPM when those are the options).
- **Cabin:** default selected = all call options for C (CRAM, CRPM — unchanged in practice).
- User can still toggle any chip off after open.
- Future dictionary codes for a division are included in the default set without another magic number.

## 4. Non-goals

- No backend / dictionary / generate API changes.
- No change to Apply / Review / conflict policy.
- No per-code “default on/off” dictionary flag.

## 5. Approach (chosen)

**Select all assignment codes for the active division** wherever a default selection is computed. Remove the hardcoded “2”.

Rejected alternatives:

- Hardcode Pilot to `slice(0, 3)` — still a magic number.
- Dictionary-driven default flags — unnecessary for this bug.

## 6. Implementation

**File:** `gantt/src/stores/res-planner-store.ts` only (plus tests).

1. Initial state: map all `FALLBACK_CALL_OPTIONS.P` assignments (no slice).
2. `setDivision`: `selectedAssignments = opts.map((o) => o.assignment)` (full list).
3. `setCallOptions`: when resetting selection for the active division and current selection is empty after filter, use `codes` (full list), not `codes.slice(0, 2)`.

Preserve existing behavior when `setCallOptions` runs and the user already has a non-empty intersection of selected codes with the new options (keep that intersection).

## 7. Testing

| Layer | Assertion |
|-------|-----------|
| Store unit | Pilot initial selected includes PRAM, PRMM, PRPM |
| Store unit | `setDivision('P')` / `setDivision('C')` select all options for that division |
| Store unit | `setCallOptions('P', …)` with empty filtered selection falls back to all P codes |
| Playwright | Open RES Pairing Creator on Live → Define → Pilot → PRAM, PRPM, PRMM chips all active (`data-active` / equivalent) |

## 8. Acceptance

- Fresh open of RES Pairing Creator (Pilot): PRPM selected like PRAM and PRMM.
- Switch Pilot ↔ Cabin: each side defaults to all of that division’s options.
- Manual deselect still works; Apply only uses currently selected codes.

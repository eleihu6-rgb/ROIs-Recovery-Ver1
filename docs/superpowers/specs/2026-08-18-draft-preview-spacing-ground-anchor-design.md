# Draft preview: spacing hits anchored on ground duties

**Date:** 2026-08-18  
**Status:** Approved for implementation (user chose approach 1)  
**Follows:** `2026-08-02-draft-preview-spacing-related-neighbors-design.md` (FLY↔FLY neighbor set). That spec left inclusive window overlap out of scope unless a residual miss appeared. This is that miss.

**Anchor:** Scenario 743, assign pairing `15718` to crew `2724`. Preview-draft did not open the confirm dialog. After Save, the crew bell showed 8056.

## Problem

8056 (and 7504) persist:

- `pairing_id` = earlier duty’s pairing  
- `start_dt` / `end_dt` = rest **gap** (earlier end → later start)

When the earlier duty is a **ground** task (`pairing_id` null in `roster_flight`), the kernel emits `pairing_id = 0`. Crew 2724: SIM on 11 Aug then FLY 15718 (flight 684) on 12 Aug. Stored hit:

- `pairing_id = 0`
- message: rest between SIM 19:15 and 684 06:05 is 10:50, below 13 RH
- gap `[2026-08-11T23:15Z, 2026-08-12T10:05Z]` (SIM release → 15718 **report**, not STD)

`checkLiveDraftLegality` then drops it:

1. Related set is `{15718}`. FLY-neighbor expansion only adds FLY pairing ids; SIM has none.
2. `isRelated` tests `v.pairingId ∈ set`. `0` is not `15718`. `0` is also not null, so it does not skip the pairing check.
3. Window overlap is strict (`end > w.start`) against related **flight** STD/STA (`15:05Z–20:00Z`). Gap ends at report `10:05Z`, so it neither overlaps nor abuts the flight window.

The engine ran; Save + bell have no related-set filter, so the hit appears after persist. Live and Scenario share `checkLiveDraftLegality` (`scenario-edit-controller` already passes `contextType: 'scenario'`).

## Decision

In `isRelated`, for spacing codes **7504** and **8056** only:

- If `pairingId` is `null` or `0`, related ⇔ the violation’s crew is in **`primaryCrewIds`** (the crews this edit actually moved/assigned/removed — not pairing mates).
- Otherwise keep today’s FLY-neighbor set + existing window overlap.

`relevantNewViolations` still requires `!beforeKeys.has(...)` for 7504/8056, so a ground-anchored hit that already existed before the edit stays hidden.

Do **not**:

- Put `0` into `spacingRelatedPairingIds` (would match every mate’s ground-anchored 8056).
- Change Rust TSV, persisted `pairing_id = 0`, report/release loaders, or 7505/7507.
- Switch window overlap to inclusive endpoints (does not fix report vs STD).

## Change

`gantt/src/stores/roster-store.ts` — `isRelated` inside `checkLiveDraftLegality`.

## Tests

Extend `gantt/src/stores/__tests__/roster-store-draft-legality.test.ts`:

1. New 8056 `{ pairingId: 0, crewId: '2724' }` with `relatedPairingIds: [15718]` and a SIM ground row + FLY 15718 in after-items → confirm dialog receives that hit.
2. Same-shape historical 8056 `pairingId: 0` present in both before and after → dialog not shown.
3. New 8056 `pairingId: 0` on a **pairing mate** crew (not in `primaryCrewIds`) → dialog not shown.

Existing FLY↔FLY 7504/8056 neighbor tests stay. Vitest on this file is the gate. No Playwright (filter-only; engine already persisted the 743 hit). No `check:ui`.

## Out of scope

- Re-anchoring 8056/7504 onto the later FLY pairing
- Inclusive gap/flight window overlap
- Expanding FLY-neighbor helper to GRD/SIM/RES
- Backend `preview-draft` overlay / `focusPairingIds`

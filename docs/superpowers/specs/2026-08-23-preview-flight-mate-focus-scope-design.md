# Preview Flight-Mate Expansion: Focus-Pairing Scope

Date: 2026-08-23

## Goal

Stop Gantt draft `preview-draft` from expanding affected crews via **entire-month** flight mates of pairing mates. Seed `fltId`s only from the **focus / related pairing(s)** of the current edit, so large Scenario rosters (e.g. SIT 746 after PBS) stay under Fastify’s default 1MB body limit while **8030 segment-grain COF** (same physical `flt_id`, including across pairings) still works.

## Problem

`checkLiveDraftLegality` builds preview crew set as:

1. `expandAffectedWithPairingMates` — crews already on related pairings  
2. `expandAffectedWithFlightMates` — crews sharing any `fltId` with the expanded set  

Step 2 currently seeds **every** `fltId` on every expanded crew’s simulated roster. After pairing mates are added, that becomes those mates’ **full-period** flights → dozens of crews → thousands of `afterItems` → HTTP **413** (`FST_ERR_CTP_BODY_TOO_LARGE`).

SIT evidence (scenario 746, assign pairing **16183** to `crew_id` **1256**): pairing already had three mates; expansion reached ~58 crews / ~2875 rows / ~1.1MB+ JSON; live-server returned 413 in ~2ms.

## Non-goals

- Raising Fastify `bodyLimit` on `/api/legality/preview-draft` (optional later; not this change)
- Changing pairing-mate expansion
- Changing Rust 8030 / backend temp-roster seeding contracts
- Live-only vs Scenario-only forks (§Gantt-Unify: one shared expand path)

## Design

### Seed rule (chosen: focus-pairing fltIds)

`expandAffectedWithFlightMates(crewIds, items, focusPairingIds?)`:

| `focusPairingIds` | Seed `fltId`s | Then expand |
|---|---|---|
| Non-empty | From items with `pairingId ∈ focusPairingIds` and valid `fltId` | All crews on items sharing those `fltId`s (any pairing) |
| Empty / omitted | **Unchanged:** all `fltId`s on items whose `crewId` is already in the expanded set | Same as today |

Cross-pairing COF is preserved: focus pairing contributes `fltId` F; another pairing’s item with the same F still pulls that crew in.

### Call site

`checkLiveDraftLegality` already computes `focusPairingIds` from `relatedPairingIds` / `relatedItems`. Pass that set into `expandAffectedWithFlightMates` after pairing-mate expansion.

### API shape

Extend the existing helper (Approach 1): optional third argument rather than a new function. Only one production call site.

## Verification

- Vitest `expandAffectedWithFlightMates`:
  - With focus pairing P: mate’s other-month `fltId`s do **not** expand the set
  - With focus pairing P and shared `fltId` across pairings: both crews remain expanded (existing cross-pairing case)
  - With no focus: prior “all flts of expanded crews” behavior unchanged
- Update `checkLiveDraftLegality` tests that assert preview crew ids if signatures / payloads change
- Playwright preferred if a stable large-scenario fixture exists; otherwise Vitest regression on expand + optional payload-size assertion is enough for this change

## Success criteria

- Assigning onto a pairing that already has mates in a dense Scenario (746-class) does not fail preview with 413 due to flight-mate over-expansion
- Assigning a second ≥ Age Define pilot onto a flight already holding one still surfaces 8030 in draft preview (pairing-mate + focus-scoped flight-mate)

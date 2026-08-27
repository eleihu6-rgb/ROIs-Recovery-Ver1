# Design: Scenario Ref TZ after assign / recheck

**Date:** 2026-08-10  
**Status:** Approved (approach 1 / option C)  
**Scope:** Scenario Gantt assign Save + legality Recheck → Pairing Detail Ref TZ column

## Problem

Manual Scenario flow (e.g. scenario 718: remove pairing from crew A, assign to crew B, Save, Recheck, open Pairing Detail):

1. Fresh `add` in `applyScenarioRosterPatches` inserts `scenario.roster_flight` rows **without** `duty_ref_tz` / `duty_end_ref_tz` → NULL.
2. Save already `reloadData`s gantt → client `rosterDutyRefs` stores `null` for the new crew.
3. Recheck runs 7500 and writes refs to DB, but the client **does not** reload `rosterDutyRefs`.
4. Pairing Detail (scenario path) reads only in-memory `buildScenarioPairingInfo` → Ref TZ stays blank.

DB after Recheck may already have correct values (e.g. `-360`); the UI is stale.

## Decision

**Approach 1 (option C):**

### A. Save: sync 7500 Acc Ref TZ before patch response

In `POST /api/scenario/:id/patch-output`, after `applyScenarioRosterPatches` succeeds and **before** returning success:

- Run scenario `recalculateAccRefTz` for this scenario’s roster (same Acc Ref / rule 7500 path used by scenario result loader / legality preflight), using the scenario’s `ruleset_id`.
- Do **not** expand the INSERT column list to invent refs; 7500 remains the writer of crew-specific refs.
- Existing client Save → `reloadData` then picks up non-null `rosterDutyRefs`.

### B. Recheck READY: reload scenario gantt data

When `scenario-legality-updated` is handled and legality fetch settles to `READY`:

- Call `getScenarioGanttStore(scenarioId).reloadData(...)` (same authoritative reload as Save), so `rosterDutyRefs` matches DB after 7500 ran inside the compute worker.
- If Pairing Info dialog is open for that scenario, rebuild its `rosterDutyRefs` from the refreshed store (or close/reopen equivalent: re-run `buildScenarioPairingInfo` into dialog state when `dataRevision` / `rosterDutyRefs` change).

## Non-goals

- No change to 7500 algorithm or Local Night / 7508 semantics.
- No Live roster assign path changes.
- No fabricating refs in `applyScenarioPatchesToData` for other clients’ WS patch apply (editor relies on Save reload; bystanders align on legality READY reload or remount).

## Success criteria

- After Scenario assign Save (no Recheck yet), Pairing Detail for the assigned crew shows a non-empty Ref TZ when 7500 can resolve one.
- After Recheck completes READY, an already-open or newly opened Pairing Detail shows DB-backed Ref TZ without a full page refresh.
- Regression: Vitest covers patch-after-add writing refs (or route/service hook invoking recalculate); gantt unit covers READY → `reloadData`; Playwright optional for assign → save → detail text.

## Test plan

| Layer | Case |
|-------|------|
| live-server | After scenario roster `add` patch + Acc Ref recalculation, `roster_flight.duty_ref_tz` is non-null for the new crew×duty (fixture/mock 7500 params + airports as needed). |
| gantt | On `scenario-legality-updated` → READY path, `reloadData` is invoked for that scenarioId. |
| gantt (optional E2E) | Scenario assign → Save → open pairing detail → Ref TZ cell matches formatted offset. |

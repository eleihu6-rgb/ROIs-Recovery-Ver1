# Live Ground Task Draft Credit

Date: 2026-07-27
Status: implemented

## Problem

In Live Gantt, creating a ground task for crew `0227` on `2026-07-15` and opening it again before Save shows the edit dialog with an empty Credit value. For CR/MA ground tasks, fixed credit should be visible and editable-supporting in the workflow.

Related commit checked: `367c0746 fix: persist assignment fixed credit`.

## Findings

- Commit `367c0746` fixed Data tab persistence for `assignment.fixed_credit_min` in `live-server/src/services/data/data-save-service.ts`.
- Server-side saved ground-task creation already reads `assignment.fixedCreditMin` and writes it to `roster_flight.sch_credited_minutes` and `act_credited_minutes` in `live-server/src/services/roster/roster-service.ts`.
- The Live Gantt create path runs in draft mode before Save. `gantt/src/stores/roster-store.ts` builds local negative-id mock items for `addGroundTask`.
- Those draft mock items currently set both `schCreditedMinutes` and `actCreditedMinutes` to `null`.
- `gantt/src/components/roster/ground-task-dialog.tsx` displays Credit in edit mode from `editItem.actCreditedMinutes` falling back to `editItem.schCreditedMinutes`, so draft-created ground tasks render `-` until they are saved and reloaded.

## Implemented Fix

1. Extended the frontend assignment option shape used by `GroundTaskDialog` to include `fixedCreditMin`.
2. When creating a ground task, the selected assignment fixed credit is passed into `CreateGroundTaskInput`.
3. `useRosterStore.addGroundTask` sets draft mock item `schCreditedMinutes` and `actCreditedMinutes` from that fixed credit when present.
4. Live CR/MA ground-task edits now expose a Credit-minutes input. The update writes both scheduled and actual credit fields through the existing draft/roster update path.
5. The server remains authoritative for create persistence and derives default credit from `assignment`; the client field is only a draft preview/edit value.
6. Added regression coverage:
   - Unit/store test for draft `addGroundTask` populating credit fields when `fixedCreditMin` is provided.
   - Playwright coverage in the ground-task dialog flow that opens an MA ground task, edits Credit before Save, and asserts both draft update fields.

## Scope

Touched modules expected:

- `gantt/src/components/roster/ground-task-dialog.tsx`
- `gantt/src/types/roster.ts`
- `gantt/src/stores/roster-store.ts`
- focused tests under `gantt/src/stores/__tests__/` and/or `e2e/tests/gantt/ground-task-dialog.spec.ts`

Out of scope:

- Changing server persistence for ground tasks.
- Changing Data tab assignment save behavior from `367c0746`.
- Adding a new business source of truth for credit.

## Risks

- The frontend default draft credit is based on the currently loaded assignment option. Server remains authoritative on create Save, so if assignment config changes between draft and Save, persisted default credit may differ after reload.
- Credit edits are limited to Live ground tasks with source `CR` or `MA`; Scenario and IMP tasks remain read-only.

## Verification Plan

- `npm --prefix gantt test -- src/stores/__tests__/roster-store-draft-manday.test.ts --run`
- `npx playwright test e2e/tests/gantt/ground-task-dialog.spec.ts --project=chromium`
- If frontend UI/style changed materially: `npm run check:ui`

## Verification Results

- `npm --prefix gantt test -- src/stores/__tests__/roster-store-draft-manday.test.ts src/components/roster/__tests__/ground-task-dialog-credit.test.ts --run`: PASS, 7 tests.
- `npm --prefix gantt run build`: PASS.
- `npm --prefix live-server run build`: PASS.
- `npm run check:ui`: PASS, 0 hard violations.
- Playwright `ground-task-dialog.spec.ts`: `GroundTask-4` PASS; full file 5/6 PASS.
- Existing `GroundTask-3` failed both parallel and serial reruns because MDO remained `4` instead of expected `5`; this is unrelated to Credit fields and needs separate investigation.
- Live-server focused test was blocked at environment loading because `DATABASE_URL` was not set.

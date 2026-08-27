# Live/Scenario Gantt A/B Roster Lock, KPI, and Legality Playwright Design

Date: 2026-06-23
Status: Approved for implementation planning
Scope: Live Gantt first, Scenario Gantt second

## Goal

Validate at least two concurrent users working on the same roster period. The tests must prove the contract between roster edits, month-level roster locks, lock owner display, MCred KPI updates, and legality warnings.

The first implementation targets Live Gantt. Scenario Gantt follows after the Live contract is stable, using the same numbered cases and assertions where the Scenario workflow supports the same behavior.

## Users

Use dedicated Playwright users:

- User A: `e2e_a`
- User B: `e2e_b`

Dedicated users make lock-owner assertions stable and avoid coupling regression tests to human/admin accounts. If the accounts do not exist in an environment, the test setup must fail with a clear message or create them through an approved seed/setup path.

## Corrections to the Source Scenario

- In the assignment flow, "Crew X full month roster was locked" is interpreted as "Crew Z full month roster was locked."
- In the assignment flow, "other unlocked month of Crew X" is interpreted as "other unlocked month of Crew Z."
- "No roster and Mcred update" on User B means "no roster update and no MCred update before User A saves."
- Unsaved edits are visible to the editing user only as roster/KPI/legality draft changes. Other users should see the monthly lock and owner, but not the unsaved roster/KPI/legality deltas.

## Test Strategy

Each test uses two isolated Playwright browser contexts:

- Context A logs in as `e2e_a`.
- Context B logs in as `e2e_b`.

Both contexts open the same Live Gantt period and matching filters. Test data should be discovered dynamically from the loaded data or through API helpers:

- Crew X: assigned flying duty that can be deassigned without saving.
- Crew Y: assigned flying duty that can be deassigned and saved.
- Crew Z: eligible crew and flying duty combination where assignment triggers rule `8002` for max block hours in 28 days.

If the `8002` candidate cannot be found, the suite must fail with an explicit candidate-discovery error. It must not silently skip the legality portion unless a CI-specific environment flag intentionally marks legality-candidate discovery as unavailable.

## Live Gantt Cases

### LG-AB-001 - Open Matching Live Gantt Sessions

1. User A opens Live Gantt.
2. User B opens Live Gantt.
3. Both users apply the same period and filter state.
4. Both views are ready according to the Gantt Playwright readiness hook.

Expected:

- Both pages show the same baseline roster data for Crew X, Crew Y, and Crew Z.
- Baseline MCred is captured for each target crew.
- Baseline legality state is captured for Crew Z.

### LG-AB-010 - User A Unsaved Deassign for Crew X

1. User A deassigns one flying duty from Crew X.
2. User A does not save.

Expected on User A:

- The roster duty is removed from Crew X's roster line in draft state.
- Crew X's whole roster month is locked by User A.
- Crew X's MCred drops from baseline.

### LG-AB-011 - User B Sees Crew X Lock Only

Continue from LG-AB-010.

Expected on User B:

- User B sees a month lock for Crew X.
- The red lock line spans the whole month, including blank days between duties.
- The lock owner identifies User A (`e2e_a`).
- User B does not see User A's unsaved roster removal.
- User B does not see User A's unsaved MCred drop.

### LG-AB-012 - User B Cannot Edit Locked Month

Continue from LG-AB-010.

Expected on User B:

- User B cannot modify Crew X in the locked month.
- User B can still modify an unlocked month for the same crew when valid test data exists.
- If the environment only loads one month, this assertion must be implemented with an explicit multi-month setup or marked as a setup gap, not weakened.

### LG-AB-013 - User A Undo Reverts Crew X Draft

Continue from LG-AB-010.

1. User A undoes the deassignment.

Expected on User A:

- The removed roster duty returns to Crew X's roster line.
- Crew X's MCred returns to baseline.
- Crew X's monthly lock is released.

Expected on User B:

- Crew X's monthly lock disappears.
- The User A lock-owner display disappears.
- User B still sees the original roster and baseline MCred.

### LG-AB-020 - User A Saved Deassign for Crew Y

1. User A deassigns one flying duty from Crew Y.
2. User A saves.

Expected on User A:

- The roster duty is removed from Crew Y's roster line.
- Crew Y's MCred updates from baseline.
- The monthly lock is released after save.

### LG-AB-021 - User B Sees Saved Crew Y Change

Continue from LG-AB-020.

Expected on User B:

- The roster duty is removed from Crew Y's roster line.
- Crew Y's MCred updates to match the saved value.
- User B sees the saved state without manual page reload.

### LG-AB-030 - User A Unsaved Assignment for Crew Z with 8002

1. User A assigns a flying duty to Crew Z.
2. User A does not save.

Expected on User A:

- The new roster duty is added to Crew Z's roster line in draft state.
- Crew Z's whole roster month is locked by User A.
- Crew Z's MCred increases from baseline.
- Rule `8002` warning is shown, indicating the max block-hours-in-28-days threshold was exceeded.

### LG-AB-031 - User B Sees Crew Z Lock Only

Continue from LG-AB-030.

Expected on User B:

- User B sees a month lock for Crew Z.
- The red lock line spans the whole month, including blank days.
- The lock owner identifies User A (`e2e_a`).
- User B does not see User A's unsaved roster addition.
- User B does not see User A's unsaved MCred increase.
- User B does not see User A's unsaved `8002` warning.

### LG-AB-032 - User B Cannot Edit Crew Z Locked Month

Continue from LG-AB-030.

Expected on User B:

- User B cannot modify Crew Z in the locked month.
- User B can modify an unlocked month for Crew Z when valid test data exists.
- If the environment only loads one month, this assertion must be implemented with explicit multi-month setup or marked as a setup gap.

### LG-AB-033 - User A Undo Reverts Crew Z Draft

Continue from LG-AB-030.

1. User A undoes the assignment.

Expected on User A:

- The newly added roster duty is removed from Crew Z's roster line.
- Crew Z's MCred returns to baseline.
- Crew Z's monthly lock is released.
- The `8002` warning disappears or returns to its exact baseline state.

Expected on User B:

- Crew Z's monthly lock disappears.
- The User A lock-owner display disappears.
- User B still sees the original roster, baseline MCred, and baseline legality state.

### LG-AB-034 - User A Saves Crew Z Assignment

Start from the same setup as LG-AB-030, or redo the assignment after LG-AB-033.

1. User A assigns the flying duty to Crew Z.
2. User A saves.

Expected on User A:

- The new roster duty remains on Crew Z's roster line.
- Crew Z's MCred remains updated.
- Crew Z's monthly lock is released after save.
- Rule `8002` remains visible as saved legality information.

Expected on User B:

- The new roster duty appears on Crew Z's roster line.
- Crew Z's MCred updates to match the saved value.
- Crew Z's monthly lock is gone.
- Rule `8002` is visible to User B after the saved update propagates.

## Scenario Gantt Follow-Up

After the Live suite passes, add a Scenario Gantt suite with matching case IDs:

- `SG-AB-001` through `SG-AB-034`

The Scenario suite should reuse the same A/B contract where possible, but it must respect Scenario-specific edit locking and persisted legality behavior. Any differences from Live must be documented in the Scenario implementation plan before coding.

## Playwright Assertions

Tests should prefer state-backed Gantt hooks and stable UI test IDs over screenshot-only assertions. Visual checks are still required for the month lock line because the user requirement explicitly includes the whole-month red lock line and blank-day coverage.

Required assertion surfaces:

- roster object presence/absence for each target duty
- Crew monthly MCred before, draft, undo, and saved values
- active lock keys and lock owner
- rendered whole-month lock line extent, including blank days
- edit-blocking behavior for locked month
- edit-allowed behavior for another unlocked month
- legality warning presence/absence for rule `8002`
- cross-user propagation after save without manual reload

## Data Discovery

The implementation should include helper functions that find suitable test targets before actions run:

- Find assigned flying duty for Crew X.
- Find assigned flying duty for Crew Y.
- Find Crew Z and an assignable flying duty that triggers `8002`.
- Capture baseline roster, MCred, and legality states.

Candidate discovery may use API reads, existing Gantt hooks, or both. It must avoid hardcoding crew IDs, pairing IDs, business thresholds, or airline-specific constants.

## Cleanup

Every case that creates a draft lock or saved roster mutation must clean up:

- Unsaved draft cases release locks through undo/discard paths.
- Saved deassign and assignment cases restore the original roster state through supported UI/API workflows, or run against isolated resettable test data.
- Lock cleanup runs in `afterEach` as a best-effort safety net.

Cleanup must not use destructive database reset commands in shared environments.

## Risks and Gaps

- Current behavior may not draw a whole-month red lock line across blank days. This is an expected gap from the source note and should be captured as a failing assertion until fixed.
- If only one month is loaded in the Gantt view, the "can edit other unlocked month" assertion needs a multi-month test setup.
- `8002` candidate discovery may be expensive. The implementation should cache discovered candidates within the test worker when safe.
- Saved Live changes affect shared data. The implementation must use reversible mutations or isolated test fixtures.
- Scenario Gantt may differ from Live in how unsaved legality and locks are represented; this must be handled in the Scenario follow-up plan.

## Out of Scope

- Changing roster lock behavior.
- Changing MCred calculation logic.
- Changing rule `8002` thresholds or rule-engine behavior.
- Implementing Scenario Gantt before Live Gantt coverage is stable.
- Adding new production dependencies.

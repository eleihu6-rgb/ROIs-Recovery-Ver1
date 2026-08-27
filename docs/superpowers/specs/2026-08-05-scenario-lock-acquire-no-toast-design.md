# Scenario Lock State Changes Without Success Toast

## Goal

When a user clicks the Scenario Gantt `Viewing · Read-only` control and successfully
acquires the edit lock, the toolbar should transition to `Editing` without showing a
success toast or dialog. When the user clicks `Editing` to release the edit lock, the
toolbar should transition back to `Viewing · Read-only` without showing a success toast
or dialog.

## Scope

- Keep the existing `acquireLock` API call and lock-state transition unchanged.
- Keep the existing `releaseLock` API call and lock-state transition unchanged.
- Remove the success notifications `Edit lock acquired` and `Edit lock released`.
- Preserve error feedback when the lock is owned by another user or the request fails.
- Apply the behavior to the shared Scenario Gantt lock flow, including normal Scenario
  views and existing test-controlled lock transitions.

## Implementation

Update `gantt/src/stores/scenario-gantt-store.ts` so the successful acquire branch
updates `lockStatus` and `acquiringLock` but does not call `notify.success`. Update the
successful release branch so it clears the lock state and pending edit state without
calling `notify.success`.

No toolbar markup or API contract changes are required.

## Verification

- Add a focused store regression test that verifies successful lock acquisition updates
  the lock state without invoking `notify.success`.
- Add a focused store regression test that verifies successful lock release returns to
  read-only state without invoking `notify.success`.
- Keep existing failure-path notification behavior covered by the implementation.
- Run the focused Vitest test, TypeScript check, UI standard check, and the relevant
  Playwright Scenario lock/edit test.
- The Playwright regression must drive the real `Viewing · Read-only` button, verify the
  button changes to `Editing`, and verify the success toast is absent.
- The Playwright regression must drive the real `Editing` button, verify the button
  changes back to `Viewing · Read-only`, and verify the success toast is absent.

## Risks

The only intentional behavior change is removal of positive feedback after successful
Scenario lock state changes. Lock acquisition and release failures remain visible, so
users still receive feedback when the state cannot change.

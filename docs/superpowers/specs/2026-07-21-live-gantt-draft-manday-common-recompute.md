# Live Gantt Draft Manday Common Recompute

## Problem

Live Gantt now avoids the post-save manday KPI flicker, but adding a DO task for `CrewId=911` does not update the roster header immediately. After Save, `MDO` becomes `13`, proving the backend manday recompute is correct. The missing behavior is client-side instant recompute before Save.

The affected KPI path is shared:

```text
displayed KPI = crewStatsMap server base + crewMandayDelta(baseItems, rosterItems, viewportYearMonth)
```

`crewMandayDelta` already handles added DO ground tasks, added leave tasks, deleted tasks, flying credit, and task updates from a `baseItems -> virtual rosterItems` difference.

## Root Cause

The draft add paths currently mutate `baseItems` as part of showing new mock tasks:

- `addTask` appends the mock item to `baseItems`.
- `addGroundTask` appends DO/VAC/ILL mock items to `baseItems`.

Then the code calls `draft.applyDraftOps(baseItems)`, which appends the same draft operation again or computes from a base that already contains the new task. For manday KPI deltas, this is the wrong model:

```text
base = server committed state only
virtual = base + draft operations
delta = virtual - base
```

Deleting works because it keeps the server item in `baseItems` and removes it only from the virtual roster. Adding does not work because the draft item is present in the base side too.

## Desired Behavior

All Live draft roster mutations should use one public recompute path:

- Add DO: `MDO` increments immediately, before Save.
- Delete DO: `MDO` decrements immediately, before Save.
- Add/remove/update VAC/ILL: leave counters update immediately.
- Add/remove/move/swap flying duty: `MCredit`, `MBH`, and `YBH` update from the common delta path.
- Undo/redo/discard continue to recompute from committed base plus current draft ops.

No dialog or individual mutation handler should contain custom KPI arithmetic.

## Design

Introduce a small shared helper inside `gantt/src/stores/roster-store.ts` for draft roster mutations:

```ts
const applyDraftToPane = (paneId: PaneId): void => {
  const draft = useDraftStore.getState()
  const base = useRosterStore.getState()[paneId].baseItems
  const displayed = draft.applyDraftOps(base)
  useRosterStore.setState((state) => ({
    [paneId]: { ...state[paneId], rosterItems: displayed },
  }))
}
```

Use this helper from the draft branches of:

- `addTask`
- `addGroundTask`
- `updateTask`
- `removeTask`
- `removeTasksByPairingAndCrew`
- `moveTask`
- `swapTasks`

For `addTask` and `addGroundTask`, do not append mock items to `baseItems`. Store the draft operation with the mock `RosterItem` payload and let `applyDraftOps(baseItems)` build the virtual roster.

To make generic `add` work, change the draft op payload for `addTask` to use the existing `mockItem` as the operation's `task` value, not the raw `CreateRosterInput`. The server commit path already sends `op.task` as a create payload; the mock item is structurally richer but contains the same create fields the server needs.

## Tests

Unit:

- Add a focused store-level Vitest for `roster-store` draft mutation behavior:
  - seed `baseItems` with no DO for `C911`.
  - call/add a draft ground DO through the store or through the extracted helper path.
  - assert `baseItems` is unchanged.
  - assert `rosterItems` contains the mock DO.
  - assert `crewMandayDelta(baseItems, rosterItems, month).get('C911')?.mdo === 1`.

Existing utility unit:

- `gantt/src/utils/__tests__/manday-delta.test.ts` already proves the common delta math for added DO.

E2E:

- Add or update a Live Playwright regression that drives the real Add Ground Task dialog:
  - filter/bring `CrewId=911`.
  - read rendered `MDO`.
  - add one DO task.
  - assert rendered `MDO` increments before Save.
  - Save and assert it remains incremented.

Verification:

- `cd gantt && npm test -- --run src/utils/__tests__/manday-delta.test.ts <new store test>`
- `cd gantt && npm run build`
- `npm run -s check:ui` if UI/test-hook code changes.
- `cd e2e && GANTT_TEST_USER/GANTT_TEST_PASS env set, npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps <new-or-updated-spec> --reporter=list`

## Risk

Medium. The intended data model is simpler and safer, but changing `addTask` / `addGroundTask` from "mutate base plus draft" to "base unchanged plus virtual from ops" touches the core draft rendering contract. Keep the change inside `roster-store`, prove base/virtual separation in unit tests, and drive the real UI in Playwright.

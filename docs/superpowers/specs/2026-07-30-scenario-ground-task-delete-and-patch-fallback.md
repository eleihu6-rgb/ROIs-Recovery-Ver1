# Scenario Ground Task Delete and Patch Fallback

## Problem

In Scenario Gantt:

1. `Delete` / `Backspace` is wired to the Live roster store, so it does not
   remove selected Scenario roster items.
2. The Scenario roster context menu only exposes `Remove from crew` for
   pairing assignments. Ground tasks (`pairingId === null`) have no delete
   action.
3. Saving a Scenario patch can fail with
   `Patch failed: engine-server PUT /optimize/result output 404:
   {"detail":"Task not found or has no output file path"}`. The live-server
   patch route still tries to rewrite the optimizer output file, but the
   DB-backed Scenario Gantt's user-editable state is now stored in scenario
   tables. Editing Roster rows should not depend on engine-server task-manager
   memory or an output file path.

## Scope

- Scenario Gantt roster pane only for the new Scenario delete behavior.
- Preserve the existing Live delete behavior.
- Preserve lock and `roster.canRemove` capability gates.
- Only tasks with `source = 'MA'` or `source = 'CR'` are deletable in
  Scenario. `IMP` and `PA` tasks remain visible but cannot be deleted.
- In an RO Scenario, Pairing data is fully read-only from the user's
  perspective. `pairing_composition.fill` is a derived value that changes
  automatically when Roster assignments are added, removed, or reassigned; it
  is not directly editable. All supported user edits apply to Roster data:
  roster assignment/addition, roster removal, roster reassignment, and
  ground-task create/update/delete.
- Preserve the existing `AssignmentPatch` contract and physical output format.
- Do not change database schema or engine-server route contracts.

## Design

### Scenario keyboard delete

Extend the existing Gantt keyboard handler with a Scenario branch:

- Read the active Scenario context from the Gantt context id.
- Use the Scenario roster selection store and scenario roster model.
- Handle only Roster-pane selections. Pairing-pane selections must not create
  delete patches or modify Pairing data.
- For a selected pairing task, enqueue one `remove` patch per selected
  crew/pairing combination, matching the existing right-click behavior.
- For a selected ground task, enqueue one `remove` patch containing:
  `crewId`, `pairingId: null`, `startDtUtc`, `endDtUtc`,
  `assignmentGroup`, and `assignment`.
- Skip selected tasks whose `source` is not `MA` or `CR`.
- Only enqueue patches when the Scenario store reports edit-lock ownership and
  `capabilities.roster.canRemove`.
- Clear the Scenario selection after enqueuing patches.
- Keep Live selection/deletion logic unchanged.

### Scenario ground-task context menu

Add a `Delete task` menu item for Scenario roster tasks, including ground tasks,
only when the task source is `MA` or `CR`, the current user owns the edit lock,
and `roster.canRemove` is enabled. The action enqueues the same remove patch
shape used by keyboard deletion, then closes the menu.

The existing pairing `Remove from crew` menu item is subject to the same source
gate. `IMP` and `PA` tasks have no delete menu item.

The Pairing pane remains navigation/read-only in RO Scenario. It must not
expose actions that add, remove, or mutate Pairing records, Pairing segments,
or any Pairing fields. `pairing_composition.fill` is refreshed automatically
as a consequence of saved Roster patches. Pairing-related roster operations
continue to be initiated from the Roster pane and are represented as roster
patches.

### DB-backed Scenario save

Enforce the `MA`/`CR` delete rule again in live-server before changing
scenario tables; client-side menu and keyboard gating is not the write
boundary. Save Scenario Roster patches by updating
`scenario.roster_flight`, refreshing affected `pairing_composition.fill` from
non-deleted Scenario `roster_flight` rows, recomputing Scenario manday, and
marking legality stale for recomputation.

Do not rewrite optimizer `output.gz` during manual Scenario Roster edits. The
file remains the original optimization artifact, while the DB-backed Scenario
tables are the authoritative editable view after the result has been loaded.
This removes the dependency on engine-server task-manager memory and avoids
404 failures when the task exists only as persisted Scenario data.

## Verification

Focused automated coverage:

- Scenario store/controller unit tests for ground-task and pairing remove patch
  shapes, source filtering, and capability/lock gates.
- Scenario context-menu test proving an `MA`/`CR` ground task has `Delete task`,
  while `IMP`/`PA` ground tasks do not.
- Scenario capability test proving Pairing-pane operations remain read-only in
  RO Scenario, while saved Roster patches automatically refresh the related
  `pairing_composition.fill` values.
- Scenario keyboard E2E test proving `Delete` removes a selected ground task
  through the real Scenario UI and leaves an `IMP`/`PA` selection unchanged.
- Live-server route test proving Scenario Roster delete save succeeds without
  a task output file and does not call the optimizer output patch path.

Run the smallest relevant Vitest suites first, then the focused Playwright
Scenario tests, `npm run check:ui`, and the applicable Gantt type/build checks.

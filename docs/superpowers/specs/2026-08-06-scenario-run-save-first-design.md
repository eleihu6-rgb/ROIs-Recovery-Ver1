# Scenario Run — Save First Guard (Save & Run Confirm)

> Spec date: 2026-08-06 · Module: gantt · Component: `scenario-toolbar.tsx`

## Problem

Clicking **Run** (`scenario-run-btn`) on a scenario that has unsaved edits
(`isDirty === true`) starts the optimisation with the **persisted** (old) data,
silently ignoring the user's pending changes. The user must notice the lit Save
button, click Save, then click Run again.

**Goal:** before executing the optimisation, if there are unsaved changes,
require saving first. Chosen interaction: a **Save & Run confirm dialog**
(`Cancel` / `Save & Run`).

## Behavior

### Trigger location

Only entry point that starts an optimisation: the Run button in
`scenario-toolbar.tsx` (`scenario-run-btn`). No other run entry points exist
(metadata-view / scheduler-view runs are unrelated subsystems).

### Guard order — Pre-run Check first, Save-first last

The dirty guard is the **final gate before actually running**, placed after the
existing pre-run validation:

```
handleRun (Run button) / handleConfirmedRun (Pre-run dialog "Proceed Anyway"):
  1. detail.status === RUNNING          → kill run (transition FAILED), no checks
  2. checkRunConditions(detail)         → blockers/warnings
       → Pre-run Check dialog (unchanged)
  3. otherwise (runnable):
       isDirty ? Save & Run confirm dialog : runScenario(id)
```

Rationale: if the scenario has blockers (e.g. missing Pairing Scenario), the
Pre-run Check surfaces them first, so the user fixes them instead of hitting a
"Save & Run" button that would not actually run.

### Save & Run dialog

Reuse the existing `AppDialog` pattern from the Pre-run Check dialog
(§Pop-up Window Standard):

- Icon `AlertTriangle`, title "Unsaved changes", `data-testid="save-run-dialog"`
- Body: "You have unsaved changes to this scenario. Save before starting the
  optimisation?"
- Footer: `Cancel` (left, ghost) · `Save & Run` (right, primary,
  `data-testid="save-run-confirm"`)
- `Cancel` → close dialog; no save, no run.

### Save & Run confirm

```
Save & Run:
  close dialog
  await saveDetail()
  if (useScenarioStore.getState().isDirty) return   // save failed (toast already shown)
  runScenario(id)
```

`saveDetail()` currently catches its own errors and toasts; it does not throw.
After `await saveDetail()`, `isDirty` is `false` on success and stays `true` on
failure — that is the success signal. On failure the run must **not** start.

## Edge cases

- **Kill path** (RUNNING): no dirty guard.
- **PUBLISHED**: Run button is already `disabled`; not affected.
- **FAILED / DRAFT** editable states: guard applies.
- No new store action; the toolbar composes existing `saveDetail` + `runScenario`.
- Run button `disabled` stays `saving || isPublished` — must remain clickable
  while dirty so the guard can trigger.

## Testing

- **Unit** (`scenario-toolbar` test, mock store):
  - dirty → click Run → does not call `runScenario`, opens Save & Run dialog.
  - Cancel → `saveDetail`/`runScenario` not called, dialog closed.
  - Save & Run → `saveDetail` called first, then `runScenario` on success;
    skipped when `isDirty` stays true (save failed).
- **E2E** (`e2e/gantt/scenario/`): create a runnable RO scenario, change its name
  (dirty), click Run → assert Save & Run dialog appears; Cancel → name not
  persisted, no run; Run again → Save & Run → assert name persisted and run starts.

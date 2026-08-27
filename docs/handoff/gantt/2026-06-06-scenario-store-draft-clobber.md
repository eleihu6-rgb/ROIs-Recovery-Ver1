# Bug handoff — Scenario detail: edits made during an in-flight save are silently lost

- **Date:** 2026-06-06
- **Area:** gantt / Scenario module
- **Severity:** Medium (silent data loss of a user edit; no error shown)
- **Owner:** dev team (frontend / gantt)
- **Status:** OPEN — reproduced, identified from the Regression playground. **No product fix applied** (playground identifies issues; fixes are the dev team's).
- **Failing guard test:** `e2e/tests/gantt/scenario-store-draft-race.spec.ts`
  (intentionally RED until fixed)

## Symptom

When a user edits a field in the Scenario detail panel **while a previous save is
still in flight**, the edit is discarded the instant the save's response lands.
The field visibly reverts and the **Save button disables** (the panel believes it
is "clean"), so the edit is unrecoverable without re-typing.

Concretely reproduced: create a fresh RO scenario, and while the create-save PUT
is in flight, pick a **Rule Group**. Observed:

1. the Rule dropdown shows the picked group during the in-flight save;
2. the moment the create-save resolves, the pick is dropped (the auto-select
   effect then restores the *default* RO group, which masks the loss in the UI);
3. the scenario row never carries the user's picked `rule_group_code`
   (DB ends with `""`).

This is the root cause behind the previously-flaky `scenario-*` e2e failures: a
rule group / name picked moments after a save would vanish, so the saved payload
carried the stale value.

## Root cause

`gantt/src/stores/scenario-store.ts` → `saveDetail()` success handler:

```ts
const updated = await scenarioApi.update(selectedId, updateData)
set({ detail: updated, draftDetail: { ...updated }, isDirty: false, saving: false })
```

`updateData` is read from `draftDetail` **at call time**. Any `patchDraft(...)`
that happens between the click and the response is then overwritten when the
handler does `draftDetail: { ...updated }` (server row) and resets `isDirty:false`.
It is a classic lost-update race: the success handler clobbers concurrent edits.

Compounding it:
- The Save button is `disabled={!isDirty || saving}` — disabled both while saving
  **and** when clean — so "the button is disabled" is not a reliable "saved"
  signal, and after the clobber it disables, hiding that an edit was dropped.
- `scenario-basic-info.tsx` has an auto-select effect that, when `ruleGroupCode`
  is `null`, restores the default RO group — which repaints a *plausible* value
  over the lost pick, making the loss invisible in the UI.

## Evidence

Instrumented run (PUT bodies captured): the Rule dropdown displayed
`ccar121_gantt`, yet the save PUT body carried `"ruleGroupCode":""`. Direct API
(`PUT /api/scenario/:id { ruleGroupCode }`) persists correctly, so the backend is
fine — the loss is purely client-side.

Guard test failure (the faithful symptom):

```
expect(received).toBe(expected) // Object.is equality
Expected: "ccar121_gantt"
Received: ""
  e2e/tests/gantt/scenario-store-draft-race.spec.ts:175
```

## Suggested fix direction (for the dev team — not applied here)

- On save success, **merge** rather than replace: keep any draft keys the user
  changed after the save started (e.g. diff against the snapshot sent in
  `updateData`, or version/sequence-stamp the draft and ignore a stale response).
- Separate the "saving" state from the "clean" state on the Save button so
  completion is observable (e.g. a distinct `data-saving` attribute), instead of
  overloading `disabled` for both.
- Re-check the auto-select effect so it cannot repaint a default over a value the
  user is actively editing.

## Related test-suite changes shipped alongside this report

- `e2e/pages/gantt/scenario-page.ts` — `save()` now waits for the save PUT to
  **complete** (not just start), so the feature specs are deterministic and no
  longer trip this race. The bug-identifier above deliberately does NOT use it.
- A minor related UX gap was also noted (not this bug): the PBS portal login
  surfaces axios's raw "Request failed with status code 401" instead of the
  server's "Invalid user code or password". Low priority; see
  `e2e/pages/pbs-portal/pbs-login-page.ts`.

# Design — Published/Running Scenario: Algorithm Parameters View-Only

> Date: 2026-08-11
> Module: gantt (Scenario UI) + live-server (scenario routes)
> Status: Approved by user

## 1. Problem

For a Scenario that is **PUBLISHED** (and, by extension, **RUNNING**), the
"Algorithm Parameters" button is fully disabled — the user cannot even open the
dialog to *view* the parameters that were used for the optimization. Requirement:

> Scenario 已 Publish 的场景，针对 Algorithm Param 需要支持查看参数，不支持修改

The change must make parameters **viewable** (dialog opens, all values readable)
but **not modifiable** for PUBLISHED and RUNNING scenarios.

## 2. Current Behavior

- `gantt/src/components/scenario/scenario-detail-panel.tsx:75`
  `isReadonly = detail.status === 'RUNNING' || detail.status === 'PUBLISHED'`
  locks the whole detail panel (Basic Info + Scope Filters).
- `gantt/src/components/scenario/scenario-basic-info.tsx:378` the Algorithm
  Parameters button is `disabled={disabled}` → for RUNNING/PUBLISHED the dialog
  cannot even be opened.
- `ScenarioParametersDialog` already accepts a `disabled` prop and renders every
  editor (including the special Team Rules / Min Reserve editors) read-only when
  it is set — but it also disables the `Done` button and never offers a
  view-only footer.
- Frontend saves parameters via the **generic** `PUT /api/scenario/:id`
  (`saveDetail` → `scenarioApi.update` → `scenarioService.update`), which has
  **no** status guard for `algorithmParameters`.
- The dedicated `PUT /api/scenario/:id/parameters` route guards RUNNING with a
  409 but **not** PUBLISHED (`live-server/src/routes/scenario/scenario.ts:608`).

## 3. Scope

- Gantt frontend: button + dialog read-only mode.
- Live-server backend: reject parameter writes for RUNNING/PUBLISHED scenarios.
- Tests: unit (dialog + routes), E2E regression, Help docs.

### Out of scope (§Minimal-First)

- `isReadonly` panel-level logic unchanged (Basic Info / Scope Filters stay
  read-only for RUNNING/PUBLISHED).
- No new `readOnly` prop on the dialog — `disabled` already carries the
  "view-only" semantics.
- Backend guard covers **only** `algorithmParameters` on the generic PUT, not
  other fields (name/division/etc.). Requirement targets Algorithm Param only.

## 4. Design

### 4.1 Frontend — `scenario-basic-info.tsx`

Decouple "can open the dialog" from "panel read-only":

- Remove `disabled={disabled}` from the Algorithm Parameters button (it renders
  only inside `showRoFields`, i.e. RO/TO). Button is always clickable:
  - DRAFT / DONE / FAILED → opens editable dialog (unchanged).
  - RUNNING / PUBLISHED → opens read-only dialog.
- When read-only, show a `Lock` icon (lucide) before the "Algorithm Parameters"
  label to signal view-only. The right-side summary text
  ("Using defaults" / "Changed: …") is unchanged.
- The dialog keeps receiving `disabled={disabled}` (== `isReadonly`).

### 4.2 Frontend — `scenario-parameters-dialog.tsx`

`disabled` already disables every editor; only the footer and commit path change:

- When `disabled` is true → footer is a single **Close** button (outline),
  replacing Cancel + Done.
- Close-only guarantees no `onDraftChange` fires → no draft, no `isDirty` →
  toolbar Save stays disabled for PUBLISHED/RUNNING.
- Tabs remain navigable so the user can browse every parameter group.
- When `disabled` is false → behavior fully unchanged (Cancel + Done, commit on
  Done).

### 4.3 Backend — guards (live-server)

| Location | Change |
|----------|--------|
| `PUT /:id/parameters` (scenario.ts:608) | Extend existing RUNNING 409 guard to `RUNNING \|\| PUBLISHED`. |
| `PUT /:id` generic update (scenario.ts:655) | Before calling `scenarioService.update`, fetch scenario; if body contains `algorithmParameters` and status ∈ {RUNNING, PUBLISHED} → `fail(reply, 409, …)`. |

Both paths guarded because the frontend actually saves via the generic PUT, and
the dedicated route is the other direct write path. Message style follows the
existing 409s in this file (e.g. `'Scenario parameters cannot be changed while optimization is running'`).

No legitimate flow is affected: Save is disabled in the UI for locked statuses;
run/publish/duplicate do not write parameters through these routes.

### 4.4 Testing

| Type | File | Coverage |
|------|------|----------|
| Unit | `gantt/src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx` | `disabled=true`: Close-only footer, all inputs disabled, close does not call `onDraftChange`; `disabled=false` unchanged |
| Unit | `live-server` scenario route/service tests | Generic PUT with `algorithmParameters` on RUNNING/PUBLISHED → 409; dedicated `PUT /:id/parameters` on PUBLISHED → 409 |
| E2E | `e2e/tests/gantt/scenario-detail-toolbar.spec.ts` (Scen-2060, line 224) | **Update (stale)**: PUBLISHED params button is now *enabled*; click opens dialog; editor inputs disabled; Close closes; save stays disabled |
| Help | `gantt/src/components/help/topics/scenario/scenario-overview.tsx` + `scenario-create.tsx` | Add note: RUNNING/PUBLISHED opens the dialog read-only (Help Authoring rule — doc must match UI) |

## 5. Risks

- **Low.** UI change reuses existing `disabled` rendering. Backend guard mirrors an
  existing 409 pattern. The main regression risk is Scen-2060, which is updated
  in the same change (per §Stale-Test).
- RUNNING is transient; its coverage is via unit tests rather than E2E (E2E
  transitions through RUNNING quickly).

## 6. Validation

- `npm run check:ui` must pass (no new magic values; icon/typography per
  §样式与排版标准).
- Run the unit tests and the updated Scen-2060 E2E; paste PASS results.

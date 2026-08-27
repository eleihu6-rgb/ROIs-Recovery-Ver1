# Ground Task dialog: make it draggable (AppDialog)

**Date:** 2026-08-17  
**Status:** Approved (design)  
**Scope:** Live + Scenario Gantt — Ground Task create / edit / view-only dialog  
**Related:** root CLAUDE.md 弹窗窗口标准; Pairing Info (`pairing-info-dialog.tsx`)

## 1. Problem

Clicking a ground-task puck (or Create Ground Task) opens a **Ground Task** window. Unlike **Pairing Detail / Pairing Info**, it cannot be dragged. Users need to move it to see the Gantt behind it.

## 2. Root cause

`gantt/src/components/roster/ground-task-dialog.tsx` is a **hand-rolled** `fixed inset-0` overlay (`z-[9999]`, custom white header). It does not use `@rois/ui` `AppDialog`, which already implements title-bar drag (`draggable` default `true`). Pairing Info uses `AppDialog`.

This also violates the project popup standard (all business dialogs must be `AppDialog`).

## 3. Goal

- Ground Task window is **draggable by its title bar**, same interaction as Pairing Info.
- Create / Edit / View only (Live + Scenario) all share that behavior — one component, already hoisted in `app-shell` (§Gantt-Unify).
- Form fields, save/delete, view-only rules, and existing testids stay the same.

## 4. Non-goals

- No new ground-task business logic, APIs, or credit/airport behavior.
- Do not add a one-off drag implementation.
- Do not make the dialog resizable unless already needed (not requested).

## 5. Approach (chosen)

Replace the custom overlay with `AppDialog` (`draggable` default on). Rejected: custom pointer-drag on the current chrome (duplicates AppDialog, still non-standard).

## 6. Implementation

**File:** `gantt/src/components/roster/ground-task-dialog.tsx`

- Import `AppDialog` from `@rois/ui`.
- `open` / `onOpenChange` from existing `groundTaskDialogOpen` / `closeGroundTaskDialog`.
- `data-testid="ground-task-dialog"`.
- `icon`: `SquarePlus` (same family as the Create Ground Task toolbar control).
- `title`: existing strings (`Ground Task` / `Create Ground Task` / `Edit Ground Task`) plus current `#id` and `View only` badges as `title` ReactNode (title accepts ReactNode). Keep `data-testid="ground-task-view-only"` on the badge.
- `className`: keep ~500px width (`sm:max-w-[500px]`).
- `footer`: Cancel/Close + Save (Create/Save Changes); omit Save when `readOnly`. Delete stays in body danger zone.
- While `saving`, `dismissable={false}` (popup standard).
- Remove the custom overlay / hand-rolled header / duplicate X button.
- Stacking: AppDialog portals at `z-50` like Pairing Info; Ground Task is already mounted at app-shell root. Do not keep `z-[9999]`.

**Stale tests (§Stale-Test):** existing e2e locators `div.bg-card` filtered by heading will miss AppDialog (`bg-background`). Switch to `getByTestId('ground-task-dialog')` in:

- `e2e/tests/gantt/ground-task-dialog.spec.ts`
- `e2e/tests/gantt/scenario-ground-task-open.spec.ts`

`getByRole('heading', { name: … })` should still work (`DialogTitle`).

## 7. Testing

| Layer | Assertion |
|-------|-----------|
| Playwright (new) | Open Ground Task (Live create or Scenario view-only) → `[data-app-dialog-header]` present with `bg-primary` → drag header ~140×90 → `boundingBox` moved (same pattern as `scenario-popup-standard.spec.ts` Scen-2022) |
| Playwright (update) | Existing GroundTask-* / Scen-GT-1 still find the dialog and form testids |

## 8. Acceptance

- Live and Scenario: Ground Task window moves when dragging the blue title bar.
- Pairing Info drag behavior unchanged.
- View-only, create, and edit still work; Close / Esc / overlay dismiss still close when not saving.

# Scenario RuleConfirmDialog shell hoist — Design

**Date:** 2026-08-03  
**Status:** Approved  
**Problem:** Scenario 698 assign pairing → crew: draft legality confirm dialog does not appear.

## Root cause

`checkLiveDraftLegality` / `previewScenarioPatch` call `useRuleCheckStore.showConfirmDialog`, but `RuleConfirmDialog` was mounted only inside Live `AppLayout`.

- Scenario tabs never mount `AppLayout` → dialog component absent → Promise hangs.
- If Live is also open (keep-alive), the dialog renders under an `invisible pointer-events-none` Live tab → user sees nothing.

Same class of bug as the shell `Toaster` hoist.

## Decision

Hoist `RuleConfirmDialog` to `AppShell` (one instance). Remove it from `AppLayout`.

## Out of scope

- Changing draft legality filter / preview-draft backend
- Replacing `RuleConfirmDialog` with `AppDialog`

## Success

On Scenario (without Live tab), calling `showConfirmDialog` shows a visible, clickable confirm dialog. Playwright covers that path.

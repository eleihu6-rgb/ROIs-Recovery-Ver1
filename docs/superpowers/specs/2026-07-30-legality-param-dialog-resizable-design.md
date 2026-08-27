# Design: Resizable Legality Param Dialog

**Date:** 2026-07-30  
**Status:** Approved (user: A — param dialog only; 同意)  
**Goal:** Make the legality rule parameter pop-out (`LegalityParamDialog`) user-resizable.

## Approach

Enable existing `AppDialog` prop `resizable` on `gantt/src/components/legality/legality-param-dialog.tsx` only. No change to `AppDialog` defaults or other legality dialogs.

## Behavior

- Drag edges/corners to resize (AppDialog handles).
- Open resets size/position (existing AppDialog behavior).
- Body keeps scroll; larger window shows more of the wide param table.

## Verify

```bash
npx playwright test e2e/tests/gantt/legality-param-dialog-resize.spec.ts --reporter=list
# or extend existing legality param editor e2e with resize handle assertion
```

# Scenario Import to Live Icon Alignment

Date: 2026-07-21

## Goal

Make the Scenario detail toolbar action that opens **Import Optimized Roster to Live**
visually match the Scenario list's **Published** status indicator.

## Current State

- The Scenario list renders `PUBLISHED` with Lucide `UploadCloud` and
  `text-amber-500`.
- The Scenario detail toolbar renders the Import to Live action with Lucide
  `Send` and the default muted toolbar color.

## Options Considered

1. Change only the toolbar icon from `Send` to `UploadCloud`.
2. Change the toolbar icon to `UploadCloud` and apply the same amber color as the
   Published status indicator.
3. Extract a shared Published icon component used by both locations.

## Decision

Use option 2.

- Render `UploadCloud` in the Import to Live toolbar button.
- Apply `text-amber-500` when the action is enabled, matching the Published
  status indicator.
- Preserve the existing disabled behavior for Draft, Running, and Failed
  scenarios. Disabled styling remains controlled by the shared Button component.
- Keep the existing tooltip text, test id, click behavior, dialog, and publish
  workflow unchanged.

This is the smallest change that achieves visual consistency. A shared component
would add unnecessary abstraction for two simple Lucide usages with different
containers and accessibility labels.

## Files

- `gantt/src/components/scenario/scenario-toolbar.tsx`
- `e2e/tests/gantt/scenario-detail-toolbar.spec.ts`

## Verification

- Update the existing Scenario toolbar Playwright test to assert that the enabled
  Import to Live button contains the `UploadCloud` icon and uses the amber status
  color.
- Run the focused Playwright spec.
- Run `npm run check:ui` in `gantt`.
- Run the Gantt TypeScript/build verification required by the module.


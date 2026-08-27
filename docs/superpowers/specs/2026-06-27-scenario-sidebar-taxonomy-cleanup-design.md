# Scenario Sidebar Taxonomy Cleanup Design

## Goal

Align the Scenario management sidebar with the current product language shown to planners:

- rename `PO` to `Pairing`
- show `RO` as `Roster`
- remove the dead `TO` entry from the Scenario sidebar

This change is intentionally scoped to the Scenario frontend surface in `gantt/`.

## Current Problem

The Scenario sidebar currently exposes optimizer abbreviations directly and carries a Training Optimizer entry that the product no longer supports on this screen:

- `PO` is shown as a raw abbreviation
- the `RO` row renders without its text label
- `TO` is still visible even though there is no active Training Optimizer workflow here

That creates avoidable operator confusion and makes the visible navigation inconsistent with the rest of the product wording.

## Scope

In scope:

- Scenario sidebar labels and selectable items in `gantt`
- minimal Scenario shell/store cleanup required to remove the dead `to` sidebar branch cleanly
- focused tests covering the visible nav behavior
- frontend version bump required by project policy

Out of scope:

- changing backend `ScenarioType` values (`PO`, `RO`, `TO`)
- removing `TO` from APIs, shared type contracts, or historical data
- removing `TO` from unrelated docs, help topics, or other modules

## User-Facing Behavior

### Sidebar

- `All Scenarios` remains unchanged
- `PO` becomes `Pairing`
- `RO` becomes `Roster`
- `TO` is removed
- `Crew Bids` remains unchanged

### Filtering behavior

Visible wording changes, but the existing list filter mapping stays intact:

- clicking `Pairing` still filters the Scenario list by `fileType = 'PO'`
- clicking `Roster` still filters the Scenario list by `fileType = 'RO'`

No API contract changes are required.

## Technical Design

### Sidebar rendering

Update `gantt/src/components/shell/shell-sidebar.tsx`:

- rename the visible labels in `SCENARIO_MENU`
- remove the `to` menu item from `SCENARIO_MENU`
- stop hiding the `ro` label in expanded mode
- keep existing `data-testid` values for `scenario-nav-po` and `scenario-nav-ro` so existing page objects remain stable

### Scenario shell state

Update `gantt/src/stores/shell-store.ts`:

- remove `'to'` from `ActiveScenarioItem`
- remove `'to'` from the valid persisted item list used during restore
- keep `crew-bids` behavior unchanged

This prevents the UI from preserving a sidebar state that no longer has a rendered entry.

### Tests

Add a focused Playwright regression test that verifies:

- the Scenario sidebar shows `Pairing`
- the Scenario sidebar shows `Roster`
- the Scenario sidebar does not show `TO`

Update touched tests or helpers only if they depend on the removed `to` item or old visible labels.

## Risks

- low UI risk: labels and one dead nav item change
- low state risk: persisted local storage may still contain `to`, so restore logic must fall back to a valid Scenario item
- no backend/data risk because `ScenarioType` values remain unchanged

## Verification

- targeted Playwright spec for Scenario sidebar labels
- targeted touched-area unit tests if needed
- `npm run check:ui` because this is a frontend UI change


# Data Table Inline Edit Affordance

## Goal

Make inline editing in the Altair Data basic tables discoverable without changing the existing save behavior.

## Scope

- Add a small English instruction below each basic Data section title: `Double-click a cell to edit.`
- Visually wrap the display value of editable cells in a compact, muted background block that follows the existing inline-edit visual language used by the Legality Description cell.
- Use a hand cursor and an English native tooltip on editable cells: `Double-click to edit`.
- Keep read-only cells visually unchanged and keep the current double-click, validation, save, cancel, and error flows unchanged.
- Do not change API contracts, persistence, sorting, virtualization, or metadata read-only tables.

## Design

`DataSection` receives an optional instruction and renders it beneath the section title in the existing header without adding a separate toolbar row. `BasicTablePage` supplies the instruction for the basic data sections.

`DataGrid` determines editability from the existing `onCellCommit` and column `readonly` values. For editable display cells, render the formatted value in an inline element with a subtle `bg-muted`/`ring` treatment, `cursor-pointer`, and `title="Double-click to edit"`. The cell remains the double-click target so existing event handling is preserved. Editing inputs retain their current layout.

## Verification

- Add focused component assertions for the instruction, editable affordance, tooltip, and read-only exclusion where practical.
- Extend the Data E2E coverage to assert the instruction and the editable cell affordance, then double-click a real cell and verify the editor appears.
- Run the focused Data E2E test, `cd gantt && npx tsc --noEmit`, and `npm run check:ui`.
- Run GitNexus impact analysis if the repository tool is available; otherwise record that the local index/tool is unavailable.

## Risks

The instruction increases section-header height only within the existing header. The editable visual wrapper must remain inline and compact so wide tables do not gain unexpected column width or row-height changes.

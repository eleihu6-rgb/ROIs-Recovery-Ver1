# Scenario Result Tabs Report Parity

## Status

Approved by current user request for continued Scenario detail page redesign.

## Scope

Improve the bottom result tabs in `gantt/src/components/scenario/scenario-kpi-section.tsx`.

## Goals

- Make the active result tab visually obvious.
- Align Credit Hours with the Report module's `general_kpi.credit_hour_report` fields.
- Add Credit Hours summary values and lightweight table actions.
- Align Uncovered with the Report module's `scheduling_details` sections instead of the thin reduced table.
- Add Uncovered description, summary values, and table actions.
- Give Distribution a chart-first view, a Chart/Table toggle, left-side grouping buttons, and a timezone selector.

## Data Strategy

- Prefer `results.rawResult.general_kpi` and `results.rawResult.scheduling_details`, because those are report-shaped.
- Fall back to existing `results.creditHours`, `results.uncovered`, and `results.distribution` when report-shaped data is absent.
- Do not introduce a new dependency; charts use small local SVG/HTML summaries.

## UI Strategy

- Use a dense segmented tab rail with selected background, border, and accent strip.
- Use compact section headers, summary tiles, search, and CSV export buttons.
- Keep all text in English.
- Use token-based Tailwind classes and lucide icons.

## Verification

- Update `scenario-kpi-section.test.tsx`.
- Run focused Vitest, `gantt` typecheck, and `npm run check:ui`.

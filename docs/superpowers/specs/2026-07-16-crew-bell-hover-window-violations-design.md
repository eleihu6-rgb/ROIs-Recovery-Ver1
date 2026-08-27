# Crew Bell Hover Window Violations Design

## Problem

Live Gantt crew row bell click and hover use different data paths. Clicking crew `2380` in the June 2026 Live roster opens the per-crew violation dialog with `1001`, `7501`, and `8002`, but hovering the same bell only shows `1001` and `7501`.

The missing `8002` is an effective-window violation whose physical anchor pairing is on July 13. It overlaps the June Gantt window and belongs to crew `2380`, but the current hover tooltip only scans visible June roster items and their visible pairing ids.

## Decision

For crew row bell hover, aggregate persisted display violations directly by `crewId` before falling back to visible roster-item pairing aggregation. This makes the hover tooltip match the crew bell popup and Alert Center data source for crew-level visibility.

Task-puck hover remains task-specific. It should not show all crew-level cross-window violations when the user is hovering a concrete puck.

## Scope

- Modify `gantt/src/components/gantt/violation-tooltip.tsx`.
- Add a focused regression test for the tooltip aggregation helper.
- Do not change backend APIs, violation persistence, canvas puck attribution, or Alert Center rows.

## Acceptance

- A crew bell hover for crew `2380` in June can include an `8002` whose pairing anchor is outside the visible month when `displayViolations` carries `crewId='2380'`.
- The same violation is deduplicated if it is also reachable through a visible pairing.
- Focused tests pass.

## Risks

The tooltip may show more entries for crew-row hover, but only entries already available through the clicked crew popup. This aligns the two UI affordances without broadening task-puck hover.

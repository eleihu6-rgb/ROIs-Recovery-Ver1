# 8002 Visible Window Overlap Design

## Problem

Rule 8002 cumulative-window violations are anchored to the last real FLY pairing that overlaps the violating window. This keeps the physical violation location stable. For example, crew `2380` can have an 8002 window from YYC-local `2026-06-16` through `2026-07-13`, with the persisted violation anchored to the last overlapping pairing on `2026-07-13`.

The problem is visibility when the planner opens only the June Gantt range, such as `2026-06-01` through `2026-06-30`. The anchor pairing is outside the visible range, so the current persisted-violation query can omit the row even though the actual violation window overlaps June. The crew-level bell should still warn the planner that this crew has a relevant violation in the opened range.

## Design

Separate the violation's physical anchor from the violation's effective window:

- Anchor fields stay as they are today: `pairing_id`, `start_dt`, and `end_dt` identify where the violation is pinned on the roster canvas.
- Add explicit effective-window fields to persisted violations, such as `window_start_dt` and `window_end_dt`, for rules where the checked window differs from the anchor.
- For 8002, populate these fields from the Rust checker's emitted rolling-window start/end.
- For rules without a separate effective window, leave the fields null and treat the anchor span as the effective window.

The Live `/api/violations` query should include a violation when either:

- the anchor span overlaps the requested Gantt range, or
- the effective violation window overlaps the requested Gantt range.

This makes the crew bell and Alert Center include a July-anchored 8002 row while viewing June, because the 8002 window overlaps June.

Canvas puck badges should remain tied to the anchor. If the anchor pairing is outside the visible range, no fake June pairing badge should be drawn. The crew-level bell and per-crew popup are the correct surface for cross-window cumulative findings.

## User Experience

When opening `2026-06-01` through `2026-06-30`:

- Crew `2380` shows a crew-level violation bell if an 8002 effective window overlaps June.
- Clicking the crew bell opens the per-crew violation dialog and shows the 8002 row.
- The message continues to state the true 8002 window, such as `2026-06-16..2026-07-13`.
- The July anchor pairing remains the physical location for the canvas puck badge when July is visible.

## Alternatives Considered

1. Duplicate the violation into every month or every overlapping pairing.
   - Rejected because it inflates counts, complicates Alert Center grouping, and makes cleanup/upsert logic fragile.

2. Move the anchor dynamically based on the currently opened Gantt range.
   - Rejected because the same violation would jump between pairings as the planner changes the date range.

3. Query by parsing the date range from the message text.
   - Rejected because message text is not a reliable data contract.

## Implementation Scope

- Database migration: add nullable effective-window columns to the Live `rule_violation` table and the Scenario `scenario.rule_violation` table if Scenario uses the same persisted shape.
- Recheck core: carry 8002 window start/end from the Rust checker output into the violation row.
- Live persistence: insert/update the effective-window columns.
- Scenario persistence: mirror the same fields if the scenario API and UI consume persisted 8002 rows.
- Live `/api/violations`: include rows whose effective window overlaps the requested range, falling back to anchor overlap when the effective window is null.
- Frontend stores/source: preserve the returned effective-window data if useful for dialog display, but keep canvas puck rendering anchored to `pairing_id`.

## Testing

- Unit test 8002 row mapping: a violation with anchor `2026-07-13` and window `2026-06-16..2026-07-13` carries both spans.
- Backend route test: `/api/violations?start=2026-06-01&end=2026-06-30` returns the row because the effective window overlaps June.
- Backend route test: a non-overlapping request does not return the row.
- Frontend/store test or E2E: crew-level bell appears in June for the overlapping 8002 row, while no fake June puck badge is created.

## Acceptance Criteria

- A July-anchored 8002 violation whose effective window overlaps June is visible from the crew bell and Alert Center when only June is opened.
- The same violation is not duplicated in counts.
- The physical canvas badge remains on the true anchor pairing when that pairing is visible.
- Existing non-windowed rules behave as before.

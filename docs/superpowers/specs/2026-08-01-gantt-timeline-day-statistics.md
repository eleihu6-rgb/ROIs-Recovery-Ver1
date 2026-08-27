# Gantt Timeline Day Statistics

## Scope

Live and Scenario Gantt timelines will replace the existing double-click zoom/reset
gesture with a day statistics dialog. The dialog is opened for the calendar day
under the pointer, using the active Gantt toolbar timezone.

## Behavior

- A double-click on a timeline day opens `Daily Gantt Statistics`.
- Double-clicking no longer changes zoom or horizontal scroll.
- The selected day is derived from the timeline x-coordinate and display timezone.
- Previous/next day controls are limited to the currently loaded/opened Gantt range.
- Live uses the loaded Live roster, crew, and pairing collections.
- Scenario uses the current scenario snapshot and pending in-memory changes.
- A `Details` action at the end of the dialog opens a separate table dialog using
  the same calculated model.

## Statistics Model

The calculation is a pure utility so Live and Scenario use the same definitions.

1. `Total Crew`
   - Count unique loaded Crew rows with both an effective rank and effective base.
   - Live reads `panelRank/panelBase`, falling back to current history records when
     available.
   - Scenario reads `crewRank`/`rank` and `base`.
   - Children group those crews by rank.
2. `AssignmentGroup`
   - A roster task intersects the day when its actual interval is available, or
     its scheduled interval otherwise, overlaps the timezone day's half-open
     interval.
   - Children group matching tasks by `assignment`.
3. `Layover`
   - One entry per pairing duty whose duty rest interval is represented by a
     positive scheduled or actual rest duration and intersects the selected day.
   - The duty is deduplicated by pairing and duty sequence.
4. `No Assignment`
   - Loaded valid crews with no matching roster task on the selected day.
5. `Open Pairing`
   - Pairings intersecting the day whose composition contains any `open > 0`
     (`plan - fill > 0`).

## Selection / Locate

Tree nodes are double-clickable:

- `Total Crew` or a rank child selects the matching Crew rows and brings them to
  the top of the roster pane.
- `AssignmentGroup` or an assignment child selects matching roster tasks and
  their owning Crew rows.
- `Layover` selects the affected Pairing rows.
- `Open Pairing` selects the affected Pairing rows.
- Leaf and aggregate nodes select all matching records represented by that node.

Live and Scenario selection is implemented behind a small source adapter. Existing
selection stores and `bringCrewToTop` behavior are reused.

## Detailed Table

The details dialog displays one row per calculated record with:

- Category
- Crew ID
- Rank
- Assignment Group
- Assignment
- Pairing ID
- Pairing Label
- Start / End in the active Gantt timezone
- Source (`Roster`, `Layover`, or `Pairing`)

Rows can be double-clicked to perform the same locate/select action as the tree.

## Verification

- Pure utility tests cover timezone day boundaries, actual/scheduled fallback,
  valid crew filtering, deduplication, no-assignment, open pairing, and grouping.
- Playwright coverage drives both Live and Scenario timelines, asserts that a
  double-click opens the dialog without resetting zoom, verifies day navigation
  boundaries, tree-node locating, and the Details table action.
- Run focused TypeScript/Vitest/Playwright checks and `npm run check:ui`.

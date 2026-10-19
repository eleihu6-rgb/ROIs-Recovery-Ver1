# Crew App UI Standard

This standard applies to every Crew App screen and to every supported layout: iPhone Air, Duo outer, Duo inner, and iPad, in portrait and landscape where supported. Product requirements may override it, but implementation convenience may not.

## Use the screen for useful content

- Treat screen area as a limited operational resource. Give roster, calendar, matrix, trip, and decision content the largest practical area.
- Use one compact header row for the page title, navigation, and primary view actions. Do not create a second toolbar when the controls can fit safely in the title row.
- Begin the main content immediately below the header. Avoid decorative gaps, duplicated headings, spacer rows, and safe-area padding on an edge already protected by the Duo status/action strip.
- Preserve safe areas, the dynamic island, hinges, system gestures, and minimum touch targets. Reclaim only space that is actually usable.
- On narrow screens, shorten visible labels, reduce gaps, or use a familiar icon while retaining the complete accessibility label. Keep every primary action reachable.

## Balance density and readability

- Prefer content-rich layouts for operational features. Show the information needed to recognize and act on a duty without opening another screen when space permits.
- Do not truncate a value while usable space remains empty elsewhere in the same row, card, pane, or screen. First redistribute widths, let the item span columns, move low-priority controls, or use the available second line.
- Do not leave a large blank pane while another pane clips labels or hides duties. Rebalance columns and row heights at each responsive breakpoint.
- Size columns from content priority rather than equal fractions. Identifiers, routes, dates, times, status, and the next action must remain readable before secondary descriptions.
- Use progressive density when the content volume varies. Calendar pinch/zoom, expandable rows, and detail panes may reveal more information without losing context.
- Use an ellipsis only after the layout has consumed the available area. Keep the distinguishing prefix visible and provide a tap, selection, expansion, or detail path to the complete value.
- When multiple records remain hidden, show a clear overflow indicator such as `+2…`; never let clipping silently imply that the list is complete.

## Responsive layout contract

- Design and test these reference viewports: Air `420×912` and `912×420`; Duo outer `669×951` and `951×669`; iPad `834×1210` and `1210×834`.
- Adapt structure by available geometry and safe areas, not by device-name checks.
- Air and Duo outer use compact sizing, but still use the full header width. Duo inner and iPad may add columns or rails; they must not simply scale up a phone layout and leave unused space.
- The right-side Duo status/action strip is a usable layout boundary. Keep content clear of it and place rail actions there only when the active display exposes that strip.
- Landscape data views should combine title, navigation, range controls, and primary actions in one top row when they fit. The data grid begins directly below.
- Portrait layouts may wrap only when a single row would violate safe areas, readable text, or touch targets. Prefer a compact single row first.

## Visual hierarchy and interaction

- Use the active carrier palette and existing theme tokens. Compact indicators must belong to that palette and remain distinguishable in both light and dark appearances.
- Use the shared outline icon set. Pair icons with text when the meaning is not familiar; accessible names always use the full action wording.
- Keep selection, availability, warning, and disabled states distinct without adding unrelated accent colors.
- A tap selects or focuses the item. Tapping an already-selected filter item should clear it when the surrounding view can meaningfully show all records.
- Gestures require a visible or accessible alternative control. Preserve the user's selection and context while changing density or layout level.

## Required design review

Before implementation, identify the screen's primary content, primary actions, safe-area constraints, and the information that must remain readable. Inspect existing shared components and responsive utilities before adding new layout rules.

For every user-visible change:

1. Assert the behavior at all six reference viewport sizes in focused tests.
2. Check for unused regions beside truncated or hidden content.
3. Check long labels, multiple duties, empty states, and maximum realistic record counts.
4. Validate on real UI in this order: Air, Duo outer/inner, then iPad, with no more than two simulators active.
5. Capture and inspect screenshots. Confirm safe areas, one-row header behavior, readable content, overflow disclosure, and absence of overlap.
6. Run focused Jest, `npx tsc --noEmit`, the root `npm run check:ui`, and `git diff --check`.

A layout is not complete when it merely fits without overlap. It is complete when it uses the available screen well, keeps the important operational information readable, and offers a clear path to everything it cannot show at once.

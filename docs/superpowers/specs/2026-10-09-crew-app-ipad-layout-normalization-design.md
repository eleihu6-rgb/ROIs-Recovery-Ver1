# Crew App iPad Layout Normalization

## Goal

Make every iPad-reachable crew workflow intentional in portrait and landscape,
using the iPhone Duo layouts as the interaction model without mechanically
stretching phone cards to fill a tablet.

## Audit findings

- Home portrait previously stretched the trip and destination panels to viewport
  height. This is corrected: both are content-sized and Quick actions follows.
- Schedule Timeline and Route are already true work surfaces: Timeline uses a
  two-column duty grid and Route uses map plus route list.
- Schedule Calendar uses the wide split view on iPad, but sparse selected-day
  content leaves an oversized unused lower pane in portrait.
- Profile wide layout anchors a small identity/settings composition to the top
  of a large iPad canvas instead of treating it as a readable settings page.
- Destination, Trip Details, and Duty Swap already use appropriate task-led
  tablet layouts (photo/detail, legs/layover, search/matrix). They require
  regression coverage, not height inflation.
- Form/detail pages using `PageShell` already cap one-column content; their
  wide hero/body split is the intended tablet adaptation.

## Layout policy

1. Preserve content density. Never add `flex: 1` to a card merely to consume
   spare iPad height.
2. Promote task workspaces, not decorative cards: calendar, maps, matrices,
   lists and timelines may consume remaining height when they provide useful
   scan area or scrolling context.
3. Use two panes only when both panes contain independent, useful information.
   Otherwise use a bounded, centred reading column.
4. On portrait iPad, keep related panels compact and sequential; on landscape
   iPad, use a balanced two-pane composition where the task benefits from it.
5. Keep bottom navigation clear and preserve the existing iPhone/Duo behavior.

## Implementation scope

- Home: retain the compact portrait fix; regression-check portrait and
  landscape.
- Calendar: use available height for the selected-day workspace on iPad while
  keeping the month grid at readable density.
- Profile: vertically balance the wide iPad composition without changing the
  Duo inner-screen layout.
- Verify the remaining iPad flows (Timeline, Route, Destination, Trip Details,
  Duty Swap, Profile detail pages, alerts/settings, R'Bot, Check-In and Meal)
  in portrait and landscape. Make page-local corrections only where the audit
  identifies clipping, navigation collision, or a non-task surface stretched
  to fill space.

## Acceptance

- No iPad screen has a primary card stretched only to fill empty height.
- Calendar's selected-day pane has a usable work area in portrait and
  landscape.
- Profile's wide layout is visually balanced on iPad without changing Duo wide
  density.
- Existing phone/Duo layout tests remain green.
- Native iPad PR and TG flows pass and screenshots are captured from the same
  run under `docs/assets/screenshots/crew-app/`.

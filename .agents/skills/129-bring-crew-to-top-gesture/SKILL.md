---
name: 129-bring-crew-to-top-gesture
description: How the gantt "bring a crew to the top of the roster" gesture works and how to add a new trigger for it (Alert Center row click, Quality dialog row click, Filter Crew-ID input, Find Crew). Triggers when the user says "bring crew to top", "float crew", "click row to show roster", "jump to crew", "Alert Center row click", or when wiring any dialog/list to surface a crew's roster in the gantt.
---

# Bring-Crew-To-Top Gesture (gantt)

When a list/dialog should "click a crew → float that crew to the TOP of the roster pane and
scroll it into view" so the planner can inspect its roster.

## Canonical path (§Gantt-Unify): the source capability

`RosterPaneSource.bringCrewToTop(crewId: string)` in
`gantt/src/components/gantt/source/gantt-pane-source.ts`. BOTH adapters implement it, so shared
UI calls `roster.bringCrewToTop(crewId)` with **no live-vs-scenario branch**:

- **Live** (`live-gantt-source.ts`): `void bringCrewIdsToTop([crewId], rosterKey)` — the same
  pane-store `foundCrewIds` "found tier" mechanism used by Find Crew and the Filter dialog's
  Crew-ID input. `bringCrewIdsToTop` (`utils/bring-matches-to-top.ts`) also force-loads a crew
  that isn't on screen yet; Alert-Center crew are always already loaded so it just floats+selects+scrolls.
- **Scenario** (`scenario-gantt-source.ts`, paneId-bound): scenario-layout
  `setFoundCrewIds(paneId, [crewId])` + `setScrollY(paneId, 0)`. The scenario tierRows order
  found crew first (after frozen).

Both pipelines render found crew at the top (after any frozen rows), so found == top in a
default-load view with no frozen rows.

## Adding a new trigger

1. Give the source-consuming dialog an `onCrewClick?: (crewId: string) => void` prop (optional →
   non-clickable when omitted). Put `onClick` on the whole `<tr>` (any cell), add `cursor-pointer`
   + a `title` only when the handler is present.
2. In `panes/shared/roster-pane.tsx` pass `onCrewClick={roster.bringCrewToTop}`.
3. Do NOT re-implement the float in the component — always route through `roster.bringCrewToTop`
   so Live and Scenario stay unified (the scenario Quality dialog's `handleQualityCrewClick`
   delegates to it too).

## Existing triggers (all converge on this)

- **Alert Center** (`violation-list-dialog.tsx`) row click — `onCrewClick` (added 2026-06-24, F322).
- **Quality dialog** (scenario-only) row click — `handleQualityCrewClick` → `roster.bringCrewToTop`.
- **Filter dialog Crew-ID** input + **Find Crew** — `bringCrewIdsToTop` directly (utils).

## Test introspection (e2e)

- `window.__ganttTest.foundIds('roster-main')` → the floated crew ids (Live).
- `window.__ganttTest.rosterPanelOrder()[0].crewId` → the top rendered roster row.
- Regression spec: `e2e/tests/gantt/alert-center-row-bring-to-top.spec.ts` (Live-1412): open Alert
  Center via `violations-button`, click first `violation-list-row`, assert `foundIds` contains its
  `data-crew-id` AND it's the top `rosterPanelOrder` row (persists after Close).
- Scenario coverage: `scenario-roster-quality-analyzer.spec.ts` Scen-2080.
- Run: `cd e2e && GANTT_TEST_USER=Ryan GANTT_TEST_PASS=Our2027 npx playwright test
  --config=config/playwright.config.ts --project=gantt --no-deps <spec> --reporter=list`

## Gotchas

- `alert-center-8002.spec.ts` is data-dependent (needs Hard sev-3 8002 in the Live June→July
  window; demo DB often has ~1 → can fail before any dialog interaction). Not related to this gesture.
- The Alert Center dialog has TWO Close buttons (X icon `aria-label="Close"` + footer text "Close").
  Target the footer by text: `dialog.locator('button', { hasText: 'Close' })`.
- Playbook: `docs/modules/gantt/live-scenario-gantt-playbook.md` §4.2 (RosterPaneSource table).

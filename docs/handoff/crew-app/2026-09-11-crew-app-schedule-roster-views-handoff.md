# Handoff — Crew App Schedule tab: Calendar + Route-map roster views (Ver11)

Date: 2026-09-11 · App version: `crew-app/src/version.ts` → **108**
Spec: `docs/superpowers/specs/2026-09-11-crew-app-schedule-roster-views-design.md`
Mock: `docs/superpowers/completed/crew-app-v2-mock.html` (`#mockVer` 11)

## What shipped

The Schedule tab header's bell is now a **3-line "Roster view" menu** with three
views; Alerts kept an entry point as a row inside that menu (same badge count).

| View | What it is |
|---|---|
| Timeline | The screen that already existed, unchanged. |
| Calendar | Month grid (plane glyph on a flying day, dot on any other published duty, nothing on a blank day) + an agenda. Tapping a day scopes the agenda; tapping the selected day again clears back to the whole month. A clock icon opens the day view: weekly day strip + 06:00–24:00 hour axis with the report→release duty block, ground duties and synced calendar events positioned by their real start/end. The axis opens earlier when a duty reports before 06:00 and extends past 24:00 when one lands after midnight. |
| Route map | Great-circle lines from the crew's base to each destination flown that month over a world outline, with the month summary card (flights / distance / block / duty + routes / airports / countries) and a per-route list (distance + legs). Tap a destination to highlight it; +/− to zoom. |

All three views read the same `useMonth()` → `buildMonth()` model the Timeline
list uses — there is no second month data structure.

## Files

**New**

- `crew-app/src/features/v2/schedView.ts` — the whole view model: view enum,
  web-Mercator projection, great-circle path + haversine, route de-duplication,
  month stats, calendar weeks, agenda rows, day-timeline blocks.
- `crew-app/src/features/v2/CalendarView.tsx` — compact + detail modes.
- `crew-app/src/features/v2/RouteMapView.tsx` — map, summary card, route list.
- `crew-app/src/features/v2/worldLand.ts` — **generated** world outline
  (`scripts/genWorldLand.mjs`, Natural Earth 110m, public domain, web-Mercator,
  Douglas–Peucker simplified; 112 rings / 2,800 points / 33 KB).
- `crew-app/src/features/settings/airportCoords.ts` — **generated** IATA →
  lat/lon + label + country (`scripts/genAirportCoords.mjs`), 190 airports / 184
  with coordinates. Source: the live `airport` table for every airport in
  `flight ∪ roster_flight`, plus `scripts/data/extraAirports.txt` (see below).
- `crew-app/.maestro/tg_sched_roster_views.yaml`,
  `crew-app/.maestro/et_j4002_sched_roster_views.yaml`.
- Tests: `__tests__/features/schedRosterViews.test.ts` (pure model),
  `__tests__/features/scheduleRosterViews.test.tsx` (menu + views + Route map).

**Changed**

- `ScheduleScreen.tsx` — menu trigger, `schedViewMode`-equivalent state, calendar
  selection, view switching (the date strip only renders in Timeline).
- `model.ts` — `DayMeeting` gained `endMs` + `endHhmm` (a calendar event needs a
  real end on the same clock as its start).
- `components/v2/icons.tsx` — `menu3`, `list`, `map`, `zoomIn`, `zoomOut`.
- `theme/carrier.ts` — `cardSolid` (a menu floating over a card must not let the
  card read through it).
- `version.ts` — 107 → 108.

## Decisions worth knowing

1. **Map = SVG, not `@rnmapbox/maps`.** A native map module costs a Mapbox token
   plus a pod install + Xcode rebuild and would still be blank for
   portal-captured carriers. The SVG map renders offline on both carrier types.
   Trade-off: no pinch-rotate, no street-level detail (zoom buttons + auto-fit
   instead). Swapping in a real map later only touches `RouteMapView.tsx`.
2. **Coordinates are a generated static table.** Regenerate with the psql snippet
   in the script header. `scripts/data/extraAirports.txt` exists because the TG
   portal roster flew to 8 cities (NRT/ICN/PEK/DPS/CGK/DAC/OSL/NGO) that the SIT
   `flight` table never had — without it the map silently dropped those routes.
   **Extend that file whenever a capture shows an airport the map skipped.**
3. **`Duty` = each day's own report→release window** (report = the roster's
   check-in on the duty's first leg, else an hour before departure; landing after
   midnight belongs to the day it started). Check-in-to-end-of-rotation would
   have counted layover rest as duty (122 h for ET's month instead of 122:15
   being flying-day duty).
4. **A pre-midnight report on a post-midnight flight** (TG662: report 22:45,
   wheels up 00:30) draws from 00:00 but labels its real window `22:45–05:45` —
   found on the simulator, pinned by a unit test.
5. **No repeated info:** the icon says flight/duty/meeting, and a day-scoped
   agenda no longer repeats the date its header already shows.

## Verification (all run 2026-09-11)

| Check | Result |
|---|---|
| `npx tsc --noEmit` (crew-app) | PASS |
| `npx jest` (crew-app) | **PASS — 53 suites / 528 tests** (29 new: 21 model + 8 view) |
| `npm run check:ui` | PASS — 0 hard violations (124 pre-existing warnings) |
| Maestro `tg_sched_roster_views.yaml` (TG 35459, iPhone 17 / iOS 26.5) | **PASS** — 36 steps |
| Maestro `et_j4002_sched_roster_views.yaml` (ET J4002) | **PASS** — 30 steps |
| Maestro `pr_sched_roster_views.yaml` (PR 433535) | **PASS** — 20 steps |

Screenshots (`docs/assets/screenshots/crew-app/`) — `-Ver1` is the first pass,
`-Ver2` re-validates after the Calendar glyph was switched to the mock's outline
plane: `schedviews-Ver1/2-00…08` (TG), `et-schedviews-Ver1/2-00…06` (ET) and
`pr-schedviews-Ver1/2-00…02` (PR). TG proves the monthly network out of BKK
(4 routes / 35,631 km) and the pre-midnight duty block; ET proves the
API-backed roster out of ADD (7 routes / 64,070 km) with the emerald theme; PR
proves the third carrier centres on its own base (MNL, 4 routes) with none of
TG's or ET's cities in its calendar or map — the cross-airline leak check.

The Ver2 runs were driven from temporary copies of the flows in `/tmp`: a
parallel change to `LoginScreen.tsx` (not committed here) replaces the airline
dropdown with a searchable picker, so on that in-flight build the shipped flows'
`airline-<code>` row step needs a search first. The committed flows still match
`main`'s picker. Same reason `live-server` needed a nudge to come back up
mid-session (its `tsx watch` was idling after a reload).

## Still open

- PR's 11 Sep ground duty renders as the raw portal code (`4FC`) — that is the
  portal's own label and matches what the Timeline view already shows; worth a
  display-name map if PR crew ask.
- `@rnmapbox/maps` (pinch-rotate, real tiles) is a deliberate non-goal for this
  round — revisit with a token + native-build budget.
- Airport coordinates for any city a new capture introduces (see decision 2).
- Nothing was committed: the feature is in the working tree only, version bumped
  to 108.

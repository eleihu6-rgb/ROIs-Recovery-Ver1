# Crew App Schedule Tab — Calendar + Route Map Roster Views (Ver11)

Date: 2026-09-11
Status: **Built & verified** (crew-app APP_VERSION 108). See
`docs/handoff/crew-app/2026-09-11-crew-app-schedule-roster-views-handoff.md` for
what shipped, the verification evidence and the four decisions that changed
against this spec.
Mock: `docs/superpowers/completed/crew-app-v2-mock.html` (`#mockVer` = 11) — this
is the visual/interaction reference. This doc is the build spec for the AI
agent(s) implementing it against real `crew-app` code.

## Deviations from this spec as written (decided during implementation)

1. **No `@rnmapbox/maps`.** A native map module needs a Mapbox account token, a
   `pod install` and a full Xcode rebuild — a poor trade for one screen that must
   also work for the portal-captured carriers. The map is drawn with the already
   installed `react-native-svg` over a generated Natural Earth 110m land outline
   (`src/features/v2/worldLand.ts`), so it renders offline, needs no token and
   keeps the light-slate ground the spec asks for. Pinch-rotate is replaced by
   zoom in/out controls; the view auto-fits base + every destination.
2. **Airport coordinates ship as a generated table, not a live call**
   (`src/features/settings/airportCoords.ts`, generated from the live `airport`
   table by `scripts/genAirportCoords.mjs`). A runtime call would not help the
   carriers whose roster never touches live-server, and the data is static
   reference data.
3. **Alerts stay on the Schedule tab** as a row inside the 3-line menu (with the
   same badge), so the bell's job is not lost.
4. **"Duty" in the month summary = the sum of each day's own report→release
   window**, not check-in to the end of a multi-day rotation (a layover rest day
   is not duty time).
5. **The Calendar uses the mock's own flight glyph** — the outline plane from
   the dock and the flight cards, not the filled jet silhouette, which reads as
   a solid blob in a 14 px calendar cell (Ryan, 2026-09-11).

## What this adds

The Schedule tab gets a "Roster view" picker (replacing the tab's own alerts
bell) with three views:

1. **Timeline** — today's screen, unchanged. Named so the picker has three
   parallel options instead of one nameless default.
2. **Calendar** — month grid (dot per day, small plane glyph on flight days) +
   an agenda list below it; compact and per-day-timeline sub-modes.
3. **Route map** — a map centered on crew base with a line to every
   destination flown that month, plus a month summary card (flights,
   distance, block, duty, routes, airports, countries).

Home tab's own alerts bell (`HomeScreen.tsx`) is **out of scope** — do not
touch it.

## Real files this touches

| File | Change |
|---|---|
| `crew-app/src/features/v2/ScheduleScreen.tsx` | Header: replace the `IconButton name="bell" … testID="sched-alerts"` (~line 129) with a menu trigger; add the three view containers; add `schedViewMode` state |
| `crew-app/src/features/v2/useV2.ts` | Reuse `useMonth()` — do not add a parallel data model (see "Data model" below) |
| `crew-app/src/features/v2/model.ts` | Extend `MonthModel`/`DayModel` only if a field is genuinely missing (e.g. per-leg lat/lon) — check before adding |
| `crew-app/src/components/v2/icons.tsx` | Add a 3-line "menu" icon in the existing outline style (24 viewBox, ~1.9 stroke) — do not import a new icon library |
| `crew-app/src/features/v2/nav.ts` | Only if Route map or Calendar becomes its own stack screen rather than an inline mode — default assumption is inline (matches the mock), confirm before adding a route |
| new: airport coordinate lookup | Needed for Route map + Distance stat — does not exist today (`airportZones.ts` only maps IATA → IANA timezone, no lat/lon) |
| `crew-app/package.json` | Add `@rnmapbox/maps` (RN native binding) — **not** the `mapbox-gl` web SDK the HTML mock uses |
| `crew-app/src/version.ts` | Bump `APP_VERSION` per `crew-app/CLAUDE.md` |

## Open decision — where do Schedule alerts go?

`ScheduleScreen.tsx`'s bell currently opens `Alerts` (`alertCount` from
`s.notifications.notifications.length`) and is the only entry point to alerts
from this tab. The mock repurposes that exact icon slot for the view picker.
**Before implementing:** decide with design whether alerts move to a small
badge inside the new menu, get a second always-visible icon, or move
somewhere else. Do not silently drop the entry point.

## Data model — reuse, don't duplicate

The mock's `CAL` object (mock file, ~line 841) is a **mock-only stand-in**
built because pre-rendered HTML strings in the mock's `M`/Timeline data
weren't convenient for time-math. In real code there is no such excuse:
`useMonth(year, monthIdx, now)` → `buildMonth()` (`model.ts`) already produces
`MonthModel.days[]` with `kind: DayKind`, `legs[]` (each `LegView`, itself
carrying `depTime`/`arvTime`/`fltNumber`/`fleet`/`arvDayOffset`), and
`flightCount`/`blockMinutes` for the month. Calendar and Route map must both
render from this same model — introducing a second month-shaped data
structure is the bug this note exists to prevent.

Gaps to fill (do not invent — flag if a real source doesn't exist):
- **Airport lat/lon** for Route map lines + Distance stat. Not in
  `airportZones.ts` today. Needs either a small static IATA→coord table
  (same shape as `airportZones.ts`) or a real data source — check with
  Ryan/product before hardcoding one, since coverage must match every
  airport crew actually fly to, not just the demo set (BKK/HKG/NRT/LHR/SIN)
  in the mock.
- **Distance** — great-circle (haversine) calc over the coordinate table
  above; not a new concept, just needs the table to exist first.
- **Duty hours stat** — `blockMinutes` exists; a separate "duty" total (report
  to release, per `crew-app/CLAUDE.md`'s domain model) needs its own source —
  check whether `dutyAlarmsByTrip`/roster ground-duty data already carries
  this before computing it ad hoc.

## State machine

One enum drives which sibling view renders — mirror the mock's
`schedViewMode`:

```
'timeline' | 'calendar-compact' | 'calendar-detail' | 'route'
```

- Switching **away from** `'timeline'` must not auto-open the alerts panel
  (regression hit and fixed in the mock — the old bell click-handler and the
  new menu click-handler both fired on the same repurposed element).
- Calendar compact ↔ detail is a separate manual toggle (icon), not tied to
  day selection.
- In compact mode, tapping the already-selected day **deselects** it back to
  a full-month agenda (not a no-op, not a permanent selection).

## No-duplication rule (apply to every new card/row)

Per `crew-app/CLAUDE.md` → "No duplicated info on one screen": an event or
duty row's icon already states its kind (plane = flight, house = duty/rest).
Do not also print a text label that only restates the icon (e.g. no
"Flight duty" caption next to a plane icon + flight number). This was an
explicit fix in the mock (agenda cards) — audit new Calendar/Route-map rows
against it before merging, not just the two spots already caught.

## Route map implementation notes

- Library: `@rnmapbox/maps`, not `mapbox-gl` (web-only, used in the HTML mock
  purely because the mock is a browser file).
- Style: `mapbox://styles/mapbox/dark-v11`. **Its default land/water is
  near-black** — do not ship it as-is or rely on a CSS/opacity filter (tried
  first in the mock, looked washed-out). Override the `background` / `land` /
  `landuse` / `water` / `water-shadow` layer paint properties to a lighter
  slate ground (see the `relight` table in the mock's `<script>` for the
  exact colors that read well against our card/route palette) — `@rnmapbox/maps`
  exposes the equivalent via `RasterLayer`/`FillLayer` style props or a
  custom style JSON, not the web SDK's `setPaintProperty`; confirm the
  native-binding equivalent before implementing.
- Interaction: rotate + pinch-zoom + a zoom/compass control, centered/fit to
  crew base + all destinations on open (`fitBounds`-equivalent).
- Token: the mock hardcodes a Mapbox token inline for prototyping. Production
  needs a real token behind env config, not committed client-side.
- Draw one line per **destination** flown that month from crew base (not one
  line per leg) — a round trip to the same city is one line, not two
  overlapping ones.

## Acceptance criteria

- [ ] Schedule tab header shows the 3-line menu in place of the bell; picking
      each of Timeline/Calendar/Route map switches the visible content with
      no flash of the previous view's controls (date strip, calendar grid,
      map) left visible underneath.
- [ ] Alerts remain reachable from the Schedule tab in some form (see "Open
      decision" above) — this is not optional, it's a regression if lost.
- [ ] Home tab's alerts bell/panel is provably unaffected (existing coverage
      or new test).
- [ ] Calendar compact/detail and Route map all render from `useMonth()` /
      `buildMonth()` output — no second parallel data model.
- [ ] No event/duty row repeats in text what its icon already conveys.
- [ ] Route map is legible (not a near-black void) in both light and dark
      device themes if the carrier palette supports both.

## Testing (per `crew-app/CLAUDE.md` — mandatory, not optional)

- New Jest coverage in `crew-app/__tests__/features/v2Model.test.ts` (or a
  sibling file) for: `schedViewMode` transitions, the compact-select/deselect
  toggle, and any new pure functions (distance calc, route de-duplication).
- `npx tsc --noEmit` clean.
- iOS Simulator pass with **both** TG (`35459`) and PR (`433535`) test
  accounts — confirm Route map centers on each carrier's own base and that
  switching accounts doesn't leak one airline's month data into the other's
  map/calendar.
- This is a UI change — capture Simulator screenshots per account into
  `docs/assets/screenshots/crew-app/` (or the module's existing screenshot
  convention) showing all three view modes.

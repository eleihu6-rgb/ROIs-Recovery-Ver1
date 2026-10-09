# crew-app — iPhone Duo: a layout per page, designed from the page's content

Status: DESIGN (Ryan, 2026-10-07). Supersedes the "wide = widen it" approach in
`docs/superpowers/plans/2026-10-02-crew-app-iphone-duo-fit-Ver1.md` steps 4–9.

## Rule

A page is not fitted to the Duo by stretching the phone layout across a wider window.
Each page gets a layout designed from **what that page shows**, for each of the three
form factors the app must serve:

| Form factor | Window (pt) | Status bar | Layout class |
|---|---|---|---|
| Regular iPhone / Duo outer screen | ~390–466 × 678–912, portrait | top | `compact` — today's layout, unchanged, pixel for pixel |
| Duo inner, landscape | 951 × 669 (usable ~867 × 635: 84 pt strip on the right) | right edge | `wide` |
| Duo inner, rotated 90° (portrait) | 669 × 951 | top | `tall` — NEW; today it is `compact` stretched 60 % wider |

Detection stays in `useLayout()`: `wide` = width ≥ 700; `tall` = 560 ≤ width < 700
(a window wider than any iPhone but too narrow for two full columns). (done —
`layoutClassFor`, `duoLayout.test.ts`.) A page that has nothing to gain from a
class keeps the next-smaller layout — that is a decision recorded per page below,
never a default.

Jest renders every component test at a regular iPhone's window (`jest.setup.js`
pins 420×912; the React Native preset's 750×1334 would read as `wide`). A Duo
case mocks `useLayout` for the class under test (`duoPageLayouts.test.tsx`).

Design principles for `wide` and `tall`:
1. **Second column only for a second kind of content.** Lists get a detail pane;
   forms get a summary/preview; a map gets its data; a single list of settings does
   not get split in half for symmetry.
2. **Width goes into density, not whitespace.** Horizontal strips become grids;
   7-column calendars get cells with real height; a map gets the height the width
   allows.
3. **One tap less.** On `wide`, the thing the user would tap next on a phone
   (selected day, selected route, trip legs) is already on screen.
4. The dock, back chevron and the right-edge status strip never overlap content.

## Page designs

Content = what the page shows today. L = `wide` (landscape inner), T = `tall`
(portrait inner). "(done)" = already implemented and validated by `DuoFitUITests`;
everything else is to build.

### Login
Content: hero (mark, name, tagline); card (airline, crew id, password, keep-me,
Login, social, Guest). Airline picker sheet.
- L (done): hero | card, card max 460. Picker: two columns of airlines
  (code chip + name) so 10+ carriers fit without scrolling.
- T: compact layout (the card is a form; nothing else to show). Not centred/capped
  yet.

### Home
Content: greeting + bell/alarm; next-trip ticket; destination tiles; quick actions.
- L (done): ticket + **Rotation** card (every leg, layover) | destinations
  (taller tiles) + quick actions.
- T (done): ticket full width with the rotation legs **inside the ticket** under the
  dashed line; destinations as a **3-up grid** (`home-dest-grid`, not a horizontal
  strip); quick actions one row of 5.

### Trip details
Content: hero; calendar toggle; per-leg cards (wake/leave/check-in/STD/STA/ETD/ATD/
gate/aircraft/transfer); layover hotel.
- L (done): legs | calendar + hotel.
- T (done): calendar toggle and hotel card **side by side** under the hero
  (`trip-tall-cards`), then the legs at full width.

### Schedule — timeline
Content: month header + roster-view menu; date strip; day cards (flight legs with
wake/leave/check-in; ground duties; meetings).
- L (done, revised 2026-10-08 on Ryan's feedback): the **date strip stays on top** as
  on the phone; the day cards run in **two columns** (`sched-grid`, strip ⇄ list
  stay in sync by rows). The earlier master/detail (vertical day list | selected
  day) is replaced — it dropped the date picker the crew expects.
- L, all three views: the roster-view menu becomes a **toolbar on the right edge**
  (`sched-view-rail`): Timeline / Calendar / Map in one glass pill, Alerts (badge)
  below, sitting in the Duo's 84 pt status strip under the clock
  (`sched-view-rail-edge`), as iOS 27's own apps do. Phone and T keep the menu.
- T: compact timeline; the date strip shows ~10 days at this width by itself. The
  fourth "release" cell is NOT built: the leg model carries no release time, and a
  figure the roster does not publish is not invented for a layout.

### Schedule — calendar
Content: month grid (7 × 5–6, duty markers); selected-day agenda; day timeline
(hours × 44 pt) with meetings.
- L (done): month grid (max 420 wide, square cells) | selected day's **agenda +
  hour timeline** (`cal-wide`, `cal-day-pane`); tapping a day or an agenda row
  updates the right pane (no grid⇄timeline switch; `cal-to-detail` is not shown).
- T (done): grid cells with `aspectRatio 1` (today they are flat 34 pt strips);
  agenda below as today.

### Schedule — route map
Content: world map with routes; stats (flights/km/block/duty; routes/airports/
countries); route list.
- All classes: the map is **framed on the crew's base** — centred on it, sized for
  the farthest destination either side, longitudes unwrapped around the base so a
  trans-Pacific route (MNL → JFK) is one line on the base's side; the world outline
  repeats past ±180. The wide card frames at its own measured ratio (no empty band).
- L (done): map | stats + routes. Tapping a route highlights it on the map (the
  per-route leg list under the stats is NOT built: the route model carries legs as
  a count, not as flights).
- T (done): map height = card width × 0.62 (≈ 390 pt instead of 240); the seven
  stats in one row (`route-stat-row`); route list in 2 columns (`route-grid`).

### Destination
Content: full-bleed city photo pager; info panel (arrive/depart/layover, hotel,
transfer, weather, tips); header (back, dots, trip-details pill).
- L (done): photo (left 55 %, full height, `dest-photo-pane-wide`) | info as a
  scrolling side panel on the carrier ground (no type over the picture); the dots
  stay in the header; pager re-seats its offset on width change.
- T (done): photo 50 % height (`dest-photo-pane-tall`), info panel below with
  hotel/transfer as **two side-by-side cards** (`dest-split`).

### Alerts (Notifications)
Content: list of alerts; discretion card with FDP figures, legs, accept/reject.
- L (done): alert list (one-line rows, `alerts-wide`) | selected alert's detail
  (`alerts-detail`): an open FDP decision is the default detail and is answered
  there; tapping a row shows that alert's full card and marks it read.
- T: compact — the list is already full width and the FDP figures already sit on
  one row (current → proposed · delta). Decision, not a default.

### R'Bot
Content: header; thread (bubbles, capability card, suggested chips); composer.
- L (done): thread (3) | **context panel** (2, `rbot-context`): next duty card
  (opens Trip details) and the "try asking" chips — which then leave the welcome,
  so they never appear twice. Back on the left.
- T (done): compact, bubbles max 560; chips already wrap.

### Profile
Content: title + bell/gear; avatar/name/meta; block-hours card; settings list;
Log Out.
- L (done): identity + block hours | settings + Log Out.
- T (done): one column capped at 560 and centred (`profile-tall`) — a settings
  list reads top-down, it is not split. The "28-day bar" is NOT built: the roster
  carries no 28-day block figure to draw.

### Settings pages (Alarms settings, Time zone, Preferences, Appearance, Personal info)
Content: Hero explainer + a radio/toggle list (+ Appearance: theme tiles).
- L (done): hero explainer | the list, through `PageShell`'s `hero` prop
  (`page-columns`): Time zone (explainer + L/B/Z legend), Appearance, Personal
  info, every Spec page with a hero. Alarms & Meetings and Preferences have no
  explainer → one centred column. Appearance keeps its rows (a 3-up tile grid for
  four themes was not worth a second component).
- T (done): one column, max 560, centred (`page-centred`).

### Absence (form) / Absence history
Content: type chips; from/to dates; note; submit; history list with states.
- L (done): explainer + **Summary** (type, dates, days, affected duties, link to
  submitted requests; `absence-summary`) | the form.
- T (done): one centred column (via PageShell). The chip row / side-by-side dates
  were not built: the type list has one live option, the rest "coming soon".

### Discretion
Content: FDP current/proposed/limit/delta; legs; reason; decision actions.
- L (done): inside `DiscretionCard` (`disc-wide`): window + FDP figures + limit +
  reason | legs + decision. Shared by Alerts and the Discretion page (which stays
  full width, `layout="full"`).
- T (done): compact — the figures already read as one row.

### Spec pages (check-in, duty swap, more, privacy, help, settings, limits…)
Content: placeholder copy per id.
- L/T (done): centred column max 560 via `PageShell` (no hero → `page-centred`);
  a Spec page with a hero (Check-In, Duty swap, Help…) gets the explainer column
  on L. Decision, not a default.

### Global
Content: "Coming soon" placeholder.
- L/T (done, no change): the placeholder is already centred with a 280 pt text
  measure.

### Dialogs (AppDialog, avatar sheet, airline picker)
- All orientations allowed (done). Card max 340 (done). A scrolling body was not
  added: the tallest dialog is under 400 pt, the landscape inner screen is 669.

## Verification per page
- `compact`: Maestro `regression_ek_k1001.yaml` on the iPhone Air before/after,
  pixel-diff must be 0 except for an explained, intended fix.
- `wide` and `tall`: `DuoFitUITests` (K1001) runs the full tour twice —
  `DUO_ORIENTATION=landscape` and `=portrait` — on a dedicated "iPhone Duo — Test"
  simulator; inner-display screenshots via `ios/scripts/duo-shot-watcher.sh`, every
  page inspected, saved as `docs/assets/screenshots/crew-app/duo-<page>-<L|T>-Ver<N>.png`.
- Layout-class assertions in `DuoFitUITests` per page (column positions, no element
  under the dock or the status strip).

## Order of work
1. `tall` class in `useLayout` + unit test. (done)
2. Home (T), Schedule timeline (L master/detail), Calendar (L + T cells),
   Destination (L + T) — the pages the crew lives on. (done)
3. Alerts, R'Bot context panel, Absence, Discretion. (done)
4. Settings pages, Login picker grid, Profile T, Spec/Global. (done)

Unit coverage: `__tests__/features/duoPageLayouts.test.tsx` (every page above at
wide, tall and phone).

Rotating / folding the simulator from a script: neither `XCUIDevice.orientation`
nor `devicectl device orientation set` changes the Duo's inner screen. DeviceHub's
hinge slider and orientation picker send a vendor-defined HID event (usage page
0xFF61, usage 0x5B; `source` = `hinge-slider-control` / `orientation-picker-control`,
`provider` = `com.apple.Virtualization`). `duoctl` (MIT, github.com/skarol/duoctl —
pointed to by Ryan via getsentry/MobileBuildMCP#494) wraps that:
`duoctl -d <udid> open | close | rotate portrait|landscape | state | screenshot`.
It compiles a small helper with Xcode's clang and runs it inside the simulator via
`simctl spawn`; no network. Verified on "iPhone Duo — Test" 2026-10-08: `rotate
portrait` → 669×951, read back with `devicectl device info displays`.

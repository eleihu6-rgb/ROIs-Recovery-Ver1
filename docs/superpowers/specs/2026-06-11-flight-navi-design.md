# Flight Navi — Design Spec

> Date: 2026-06-11
> Module: gantt (frontend only)
> Branch: feat/gantt/flight-navi

## Purpose

A table-style navigator over the flights currently shown on the Gantt. It lists every
flight's info in a sortable/filterable grid and lets the user **navigate** from a flight to
the pairings that use it, the crew flying it, and the flight's detail card — bringing those
items to the top of the relevant Gantt pane.

## Scope & architecture

**Frontend (gantt) + one read-only backend endpoint.**

> **Decision change (2026-06-11, during implementation).** The original plan computed the PTNs
> (pairing) and Roster (crew) counts client-side from loaded stores. This proved unworkable:
> the pairing **list** endpoint returns neither `flights[]` nor `segments[]`, and the roster
> pane view aggregates to pairing level so every loaded roster item has `fltId = null`. There
> is therefore **no** flight→pairing or flight→crew linkage in the browser — client-side counts
> would always render 0 (a §No-Illusion violation). The flight→pairing link lives in
> `pairing_segment.flt_id` and the flight→crew link in `roster_flight.flt_id`, both server-side.
>
> Resolution: a single batched endpoint `GET /api/flight/navi-counts?startDate&endDate` returns
> per-flight `{ pairingCount, crewCount }` via two `GROUP BY` aggregates — one round trip for the
> whole range, **not** N+1 (the user's actual concern behind "client-side").

Navigation targets use the existing authoritative helpers `findPairingsByFlight(id)` and
`findCrewToTop('flight', id, 'main')` (backend-resolved, force-load hidden rows).

Version impact: `FRONTEND_VERSION` +1, `BACKEND_VERSION` +1.

## Entry point

A **"Navi"** button on the Flight pane toolbar (`gantt/src/components/panes/flight-pane.tsx`).
Clicking opens the Flight Navi dialog. Open state lives in `ui-store`
(`flightNaviOpen` / `openFlightNavi` / `closeFlightNavi`).

## Window

A large **`AppDialog`** (`@rois/ui`) honoring the mandatory pop-up standard: `bg-primary` blue
title bar, left Lucide icon, white title, X close, draggable by the title bar. Title
**"Flight Navi"**, wide (~`max-w-[1200px]`), scrollable table body. The window **stays open**
during navigation; the user drags it aside or closes it manually.

## Data source

Rows are the flights currently loaded for the Gantt's date range: flatten
`flight-store.items` (grouped by registration) into individual `Flight` rows. This is the same
flight set visible on the Gantt.

## Filter bar

| Control | Behavior | Source field / rule |
|---|---|---|
| Date range (start/end) | Defaults to Gantt range; narrows displayed rows | `fltDt` |
| FLT Reg (dropdown) | Filter by aircraft registration | distinct `register` of loaded flights |
| Coverage (dropdown) | `All / Covered / Uncovered` (Covered = crew count > 0) | client-side crew count |
| **DHD** (toggle) | Deadhead flights | `airline !== homeAirline` (home code from config, not hardcoded) |
| **R/C** (toggle) | Roster-covered | crew count > 0 |
| **P/C** (toggle) | Pairing-covered | pairing count > 0 |
| **CNL** (toggle) | Cancelled | `isCancelled` (reuse `flight-service` logic: `fltSts` contains `CX` or `flightFlag==='X'`) |
| DEP (text) | Departure airport filter | `depArp` |
| ARR (text) | Arrival airport filter | `arvArp` |
| FLTH (number) | Minimum block-hours | `blkMin / 60` |
| **Fizz box** (top-right, with clear ✕) | Smart free-text (see below) | composite |

Toggles are multi-select and AND-combined with the other filters.

### Fizz (smart) filter grammar

- pure number/code (e.g. `924`) → flight number contains match
- `BKK-HKT` → departure = BKK **and** arrival = HKT
- `YVR-` → departures from YVR
- `-YVR` → arrivals into YVR

Matching is case-insensitive; airports compared on 3-letter code.

## Table columns

`STS · Carrier · Date · Dow · Flight No. · DEP · STD · ATD · ARR · STA · ATA · A/C ·
SubFleet · Registration · Assignment · PTNs · Roster · COF · Composition`

| Column | Source |
|---|---|
| STS | status badge from cancelled state |
| Carrier | `airline` |
| Date | `fltDt` |
| Dow | day-of-week derived from `fltDt` |
| Flight No. | `fltNum` |
| DEP | `depArp` |
| STD | `schDepDtUtc` (time) |
| ATD | `actDepDtUtc` (time) |
| ARR | `arvArp` |
| STA | `schArvDtUtc` (time) |
| ATA | `actArvDtUtc` (time) |
| A/C | `fleet` |
| SubFleet | `subFleet` |
| Registration | `register` |
| Assignment | `flightAssignment` / `flightFlag` |
| PTNs | client-side pairing count — **clickable navi** |
| Roster | client-side crew count — **clickable navi** |
| COF | **clickable navi** (opens flight detail) |
| Composition | best-effort from loaded crew/composition data |

Numeric/time/ID columns use `font-mono tabular-nums` per the CSS standard.

## Navi actions

These reuse the project's existing authoritative "bring to top" helpers (which the pairing/
roster panes already render via `pane-store.foundCrewIds`), so no new pane-store state was added:

- **Click PTNs cell** → `findPairingsByFlight(flight.id)` — resolves the pairing ids from
  `pairing_segment.flt_id` (backend), force-loads any hidden, floats them to the **top of the
  pairing pane**.
- **Click Roster cell** → `findCrewToTop('flight', flight.id, 'main')` — resolves crew from
  `roster_flight` (backend), appends any missing, floats them to the **top of the roster pane**.
- **Click COF cell** → `useUiStore.getState().openFlightDetail(flight.id)` (same dialog as
  double-clicking a flight puck).

The Navi window stays open after each action so the user can keep navigating.

## Modules / units

- `gantt/src/components/flight-navi/flight-navi-dialog.tsx` — the AppDialog shell + layout.
- `gantt/src/components/flight-navi/flight-navi-filter-bar.tsx` — filter controls.
- `gantt/src/components/flight-navi/flight-navi-table.tsx` — the grid + navi cells.
- `gantt/src/components/flight-navi/flight-navi-filters.ts` — pure filter predicates
  (DHD/CNL/coverage/fizz parsing) — unit-testable, no React.
- `gantt/src/components/flight-navi/use-flight-navi-data.ts` — pages the flight list + fetches
  the batched navi-counts, composing `NaviRow[]`.
- `ui-store` — add `flightNaviOpen` open/close.
- `flight-service.naviCounts` + `GET /api/flight/navi-counts` — batched per-flight counts.
- `flight-api.naviCounts` — frontend client for the endpoint.
- `gantt-test-hook.foundIds(pane)` — test reader proving the navi reorder effect.

Each unit has one purpose, a clear interface, and is independently testable. The pure
predicate module isolates the airline-domain rules from rendering.

## Testing (§Playwright-Required + §No-Illusion)

- **Playwright** `e2e/tests/gantt/flight-navi.spec.ts`:
  1. Open Navi from the flight pane → assert flights are listed (specific flight number visible,
     row count matches).
  2. DEP / ARR airport filter narrows rows correctly (right rows present, wrong absent).
  3. FLT Reg dropdown filters to one registration.
  4. Fizz filter: `YVR-` (departures), `-YVR` (arrivals), `BKK-HKT` (pair), and a flight number.
  5. R/C and P/C toggles filter to covered flights.
  6. Navi clicks: PTNs reorders the pairing pane (target pairing at top), Roster reorders the
     roster pane (target crew at top), COF opens the flight detail dialog.
- **Vitest unit** `gantt/src/components/flight-navi/flight-navi-filters.test.ts`: DHD
  (`airline !== home`), CNL (`isCancelled`), coverage, and fizz grammar against mock flights —
  required because live data is homogeneous (all F8 / active) and cannot exercise DHD/CNL via DOM.

## Out of scope

- Backend pairing/crew count endpoints (deferred; client-side per decision).
- V/R (divert) and WIN toggles (dropped).
- Editing flights from the Navi table (read + navigate only).

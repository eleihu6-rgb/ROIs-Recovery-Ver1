# Flight Hover Status-Bar Info — Design

**Date:** 2026-06-11
**Branch:** feat/gantt/flight-navi
**Status:** Approved (pending spec review)

## Problem

When hovering a flight puck in the Flight pane, the bottom-left status bar currently shows
only `Flight  |  Reg: <reg>  |  ID: <id>` (`gantt/src/components/panes/flight-pane.tsx:373`).
That is opaque — the `ID` is the internal flight row id, not the flight number, and there is
no route, timing, fleet, or staffing context.

We want the status bar to show rich, accurate flight info for **any** flight currently loaded
into the gantt, refactored into operationally meaningful fields.

## Goal

On hover over a flight puck, render a single status-bar line with these fields, in order:

1. **Flight number** — `{airline}-{fltNum}`, e.g. `F8-281381` (carrier code + `-` + flight number)
2. **Dep airport** + two dates: `{date in gantt-selected tz} / {date in dep-airport local tz}L`
3. **Arv airport** + two dates: `{date in gantt-selected tz} / {date in arv-airport local tz}L`
4. **Fleet**
5. **Register** (RegNo)
6. **Composition** — per rank `plan/actual`, ranks with both plan=0 and actual=0 hidden

### Rendered format

```
F8-281381 · YYZ 6/10 17:00 / 13:00L → YHZ 6/10 19:10 / 16:10L · 7M8 · C-FLKA · CA 1/1  FO 1/0  FA 4/3
```

Rules:
- Each stamp is **M/D + HH:MM** (numeric month/day, 24h time), year omitted (gantt ranges are short).
- For each airport, the gantt-selected-timezone date+time is shown, then the airport-local time
  suffixed `L`. The local **date** is repeated only when it differs from the gantt-tz date (i.e. the
  instant crosses midnight between the two zones); otherwise just the local time is shown to avoid
  repeating the same date. Example cross-midnight: `YYZ 6/11 02:00 / 6/10 22:00L`.
- Composition shows `plan/actual` per rank (`CA`, `FO`, `PU`, `FA`); a rank with `plan=0 && actual=0`
  is omitted. When the flight has **no plan and no rostered crew at all**, the segment shows `No crew`
  so an empty composition is distinguishable from a load failure.
- **Carrier prefix de-duplication:** the flight number renders as `{airline}-{number}`. Some data
  stores `fltNum` with the carrier already embedded (airline `F8`, fltNum `F8604`); the leading
  airline code is stripped so the label is `F8-604`, never `F8-F8604`.

### Reuse in the Pairing & Roster panes

The same renderer (`formatFlightStatusLine`) is reused for segment hovers in the Pairing and Roster
panes via `segmentFlightInfo(fltId, partialFields, ctx)` (`gantt/src/utils/segment-flight-info.ts`),
which resolves a `Flight` from the flight store by `fltId` (preferred — full fields incl. fleet/reg)
or synthesizes one from inline segment fields, then calls `formatFlightStatusLine`. Each pane keeps
its own prefix; only the flight portion is enhanced:

- **Pairing pane:** `Pairing #<id> · Seg #<seq> · <flight info>`. The pairing segment carries
  `fltId, airline, fltNum, depArp, arvArp, schStrDtUtc, schEndDtUtc` (+ `pairing.fleet`), so the
  flight info renders standalone (no flight pane required). Composition is bulk-loaded for the
  pane's segment flight ids; airport zones from the shared airport-tz store.
- **Roster pane:** roster rows carry no structured `fltId` (a known server-only linkage gap), but
  flight rows encode the flight in `label` as `"F82820 YVR-MEX"` (`{fltNum} {dep}-{arv}`), and the
  task's `schStrDtUtc/schEndDtUtc` are the flight's scheduled times. `parseFlightLabel()` extracts
  the flight fields; combined with those times, `segmentFlightInfo` synthesizes a `Flight` and
  reuses the formatter → `<crew> · F82820 · YVR <date> <t> / <t>L → MEX …`. Because there's no
  `fltId`, composition can't be resolved, so it's omitted (no misleading `No crew`) via the new
  `hideComposition` flag. Non-flight rows (pairing routes like `"YVR/MEX/YVR"`, ground tasks) don't
  parse and fall back to `<crew> · <label> · <sch start~end>`. No backend change.
- Separator between major fields: `·`; route arrow: `→`.

## Data availability

Already on the `Flight` object loaded in the gantt store (`gantt/src/types/flight.ts`):
`airline`, `fltNum`, `depArp`, `arvArp`, `schDepDtUtc`, `schArvDtUtc`, `fleet`, `register`, `fltType`.

Gantt-selected timezone: `useTimezoneStore.timezone` (IANA zoneId).

**Not yet available client-side — must be sourced (approach A+A):**

### A1. Airport-local timezone map

`airport.zone_id` exists for all airports in the DB, but `getTimezoneOptions`
(`live-server/src/services/base/base-service.ts:30`) only returns **base** airports + UTC.
Non-base stations (e.g. GDL, YKF) have no client-side tz.

**New endpoint:** `GET /base/airport-timezones` → `{ code: 200, data: { YYZ: "America/Toronto",
GDL: "America/Mexico_City", ... }, message: "ok" }`. One row per airport from `airport` table
(`airport` → `zone_id`). Redis-cached (24h, base-data TTL), invalidated alongside the existing
`base:*` invalidations.

**Frontend:** a small `useAirportTzStore` (or fold into timezone-store) fetches the map once on
app init and exposes `zoneIdFor(airportCode): string | undefined`. Missing airport → fall back to
the gantt-selected timezone (so the `L` date equals the gantt date).

### A2. Bulk composition

Single-flight composition is computed in `getCrewList`
(`live-server/src/services/flight/flight-service.ts:430`): plan from `flight_composition` grouped
by `acting_rank`; actual = count of non-deleted `roster_flight` by `acting_rank`. Not loaded for
gantt flights — `compositionStatusMap` in `flight-pane.tsx:91` is an empty stub.

**New endpoint:** `POST /api/flight/compositions` body `{ flightIds: number[] }` →
`{ code: 200, data: { [fltId]: { CA:{plan,actual}, FO:{plan,actual}, PU:{plan,actual}, FA:{plan,actual} } }, message: "ok" }`.

Implementation: two grouped queries over the id set —
- plan: `SELECT flt_id, acting_rank, SUM(plan) FROM flight_composition WHERE flt_id = ANY($ids) GROUP BY flt_id, acting_rank`
- actual: `SELECT flt_id, acting_rank, COUNT(*) FROM roster_flight WHERE flt_id = ANY($ids) AND is_deleted = 0 GROUP BY flt_id, acting_rank`

Merge into the per-flight map (same shape/semantics as `getCrewList`). Redis-cache per request id-set
hash with the flight TTL. Input validated with Zod (array of positive ints, bounded length).

**Frontend:** a `flightCompositionStore` keyed by `fltId`. After the flight list loads, POST the
loaded flight ids and populate the store. Hover reads synchronously from the store.
**Bonus:** the same store feeds `compositionStatusMap` so the currently-stubbed composition-based
puck coloring (full/partial/cancelled) starts working — derived via the same
`actual >= plan` / `actual < plan` logic already in `getCrewList`.

## Components & data flow

```
flight list load ──► flightStore (flights)
                       │
                       ├─► POST /api/flight/compositions {ids}  ──► flightCompositionStore[fltId]
                       │                                              │
app init ──► GET /base/airport-timezones ──► airportTzStore         │
                                                  │                  │
hover(flightId) ──► flight-pane onItemHover ──────┴──────────────────┘
                       │  builds status text from:
                       │    flight (store) + airportTzStore + flightCompositionStore + gantt tz
                       ▼
                 useUiStore.setStatusBarText(line)
                       ▼
                 StatusBar renders left segment (unchanged component)
```

The formatting logic lives in a pure util `formatFlightStatusLine(flight, ganttTz, airportTz, composition)`
in `gantt/src/utils/` so it is unit-testable in isolation and keeps `onItemHover` thin.

## Units / boundaries

- `live-server` `base-service.getAirportTimezones()` — pure data map, cached.
- `live-server` `flight-service.getCompositions(flightIds)` — bulk plan/actual, cached.
- `gantt` `airportTzStore` — `{ map, zoneIdFor() }`, loaded once.
- `gantt` `flightCompositionStore` — `{ byId, loadFor(ids) }`.
- `gantt` `formatFlightStatusLine(...)` — pure string builder (no store/DOM deps).
- `flight-pane.onItemHover` — wires the three sources into the formatter, sets status text.
- `StatusBar` — unchanged; still renders `statusBarText`.

## Error handling

- `airport-timezones` fetch fails → empty map; local date falls back to gantt-tz date (no crash).
- `compositions` fetch fails → composition segment omitted from the line; other fields still show.
- Hovering a flight whose composition hasn't loaded yet → composition segment omitted until present.
- Missing `airline` → flight number renders as bare `fltNum` (no leading `-`).

## Testing

Per project rules (§Playwright-Required, §No-Illusion):

**Playwright e2e** (`e2e/tests/gantt/flight-hover-status-bar.spec.ts`):
1. Hover a known flight puck → status bar contains the exact expected line (flight number
   `F8-<num>`, dep/arv codes, both dates with `L` suffix on the local one, fleet, reg, composition
   `CA n/n ...`). Assert the full text, not just visibility.
2. **Timezone switch:** change the gantt timezone via `TimezoneSwitcher`, re-hover the same flight,
   assert the gantt-tz date updates accordingly while the `L` (airport-local) date stays fixed.
   Use a flight where the two zones differ across midnight so the dates actually diverge — proving
   both are computed independently.
3. Move mouse off the puck → status bar reverts to selection/empty state.

**Vitest unit** (`gantt/src/utils/__tests__/format-flight-status-line.test.ts`):
- Field order and separators exact.
- Both dates always shown; `L` suffix on local; equal dates still both printed.
- Composition hides all-zero ranks; renders `plan/actual`.
- Fallbacks: missing airport tz → local date == gantt date; missing composition → segment omitted;
  missing airline → no leading `-`.

**Vitest** (`live-server`):
- `getAirportTimezones` returns all airports incl. non-base; cache hit/invalidation.
- `getCompositions` bulk matches single `getCrewList` composition for the same flight; empty id set.

## Version bump

Touches both frontend (gantt) and backend (live-server) → bump **both** `BACKEND_VERSION` and
`FRONTEND_VERSION` in `gantt/src/version.ts`.

## Out of scope

- Times in the status bar (date-only by request).
- Composition for panes other than the Flight pane.
- Hover info in the Roster/Pairing panes.

# Flight Detail Date From Departure Local Design

## Status

Implemented (2026-08-24). Plan: `docs/superpowers/plans/2026-08-24-flight-detail-dep-local-date.md`.

## Goal

In the Gantt **Flight Detail** dialog, the header date and the **Flight Date** field must show the **departure-airport local calendar date** of scheduled departure (`schDepDtUtc`), using the same timezone source as the Departure **STD** time — not `flight.fltDt` truncated as a bare calendar string (which can reflect UTC / stored UTC date and disagree with STD).

## Confirmed decisions

| Decision | Choice |
|----------|--------|
| Scope | **Both** title-bar date and middle **Flight Date** |
| Instant | **STD only:** `schDepDtUtc` (not ATD-first) |
| Zone | Departure airport IANA zone via existing `zoneIdFor(depArp)` |
| Fallback | If no `schDepDtUtc` or no zone → `flight.fltDt` slice; else `—` |
| Persistence | **Do not** change DB `flt_dt` / API; display-only |

## Current behavior

`gantt/src/components/flight/flight-detail-dialog.tsx` derives:

```ts
const fltDateOnly = flight.fltDt ? flight.fltDt.slice(0, 10) : null
```

and formats that for both the header (`flightDateFull`) and Flight Date (`flightDateShort`).

Departure STD uses:

```ts
formatFlightAirportLocalTime(flight.schDepDtUtc, depZone)
```

Scenario adapter also sets `fltDt` from `schDepDtUtc.slice(0, 10)` (UTC calendar day), which diverges when local STD is still the previous evening.

## Design

1. Add a small helper next to the time helper (e.g. `format-flight-airport-local-date.ts`):
   - Input: UTC ISO + IANA `zoneId`
   - Output: `YYYY-MM-DD` in that zone (reuse `timezone-store` local-date formatting / `en-CA` day parts — same contract as cross-day / `formatTime` Z-normalization)
   - Missing input → `null` or em-dash contract matching callers

2. In `LoadedDetailBody` / header:
   - Prefer `formatFlightAirportLocalDate(schDepDtUtc, depZone)`
   - Else `flight.fltDt?.slice(0, 10)`
   - Format display with existing `format(..., 'MMM d, yyyy')` and `formatUiDate` as today

3. Keep `data-testid="flight-detail-flight-date"`; ensure header date uses the same `fltDateOnly` source.

## Non-goals

- Changing Live/Scenario `flight.flt_dt` storage or connectors
- Using ATD for the displayed Flight Date
- Arrival-local date
- Renaming the “Flight Date” label

## Testing

- Unit: UTC instant that is next calendar day in UTC but previous evening in `America/Vancouver` → local `YYYY-MM-DD` matches STD’s local day
- Unit: missing zone / missing STD → fallback to `fltDt` or `—`
- Playwright or existing Flight Detail e2e: assert Flight Date equals departure-local day for a fixture (update if stale)

## Success criteria

- Header · date and Flight Date match the local calendar day of STD at the departure airport
- STD display and Flight Date never disagree on calendar day when STD is shown

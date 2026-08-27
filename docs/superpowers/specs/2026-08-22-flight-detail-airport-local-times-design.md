# Flight Detail STD/STA times in airport local time

**Date:** 2026-08-22  
**Module:** gantt — Flight Detail dialog  
**Status:** Implemented

## Goal

Show Departure times (STD / ETD / ATD) in the **departure airport** local clock, and Arrival times (STA / ETA / ATA) in the **arrival airport** local clock — display as `HH:mm` only (no `UTC` / `LT` suffix). Header offsets such as `Departure — YVR (-7:00)` remain the timezone cue.

## Non-goals

- Do not change Block Hours, ops Status, or delay deltas (still computed from UTC instants).
- Do not change Flight Date header, footer “Updated … UTC”, or airport offset suffix format.
- Do not add ETD/ETA data sources (rows stay `—` until data exists).
- Do not show cross-day date prefixes on the time values.
- Do not change Gantt puck time display.

## Decision summary

- Approach **A**: reuse `formatTime(utcTimestamp, zoneId)` from `@/stores/timezone-store` with `useAirportTzStore.zoneIdFor(depArp|arvArp)`.
- Empty instant or missing zone → `—` (same as today for missing actuals).
- Shared Live + Scenario dialog path (§Gantt-Unify).

## Display mapping

| Field | Instant source | Zone |
|-------|----------------|------|
| STD | `schDepDtUtc` | `zoneIdFor(depArp)` |
| ETD | (none today) | dep zone when present |
| ATD | `actDepDtUtc` | dep zone |
| STA | `schArvDtUtc` | `zoneIdFor(arvArp)` |
| ETA | (none today) | arv zone when present |
| ATA | `actArvDtUtc` | arv zone |

Example (screenshot): YVR STD `02:15` UTC + `America/Vancouver` (−7) → **`19:15`**; YUL STA `07:15` UTC + `America/Montreal` (−4) → **`03:15`**.

## Files

- Helper (optional thin wrapper): `gantt/src/components/flight/format-flight-airport-local-time.ts` + Vitest
- Wire: `gantt/src/components/flight/flight-detail-dialog.tsx` — replace `formatTimeUtc` for the six time rows
- Playwright: Scen-2020 (or focused flight-detail) assert STD/STA are local `HH:mm` for mocked UTC + known airport zones when TZ map is available; if scenario mock lacks airport TZ, unit-test the helper and keep E2E smoke on `HH:mm` shape without `UTC`

## Out of scope follow-ups

- Estimated times (ETD/ETA) from ops feeds.
- Optional “show UTC” toggle.

# Flight Detail Departure/Arrival timezone offset labels

**Date:** 2026-08-22  
**Module:** gantt — Flight Detail dialog  
**Status:** Approved

## Goal

Append airport-local UTC offset to Departure / Arrival column headers, e.g. `Departure — YYZ (-4:00)`.

## Rules

| Side | Airport | Instant (prefer first available) | Zone |
|------|---------|----------------------------------|------|
| Departure | `depArp` | `schDepDtUtc` → `actDepDtUtc` | `useAirportTzStore.zoneIdFor(depArp)` |
| Arrival | `arvArp` | `schArvDtUtc` → `actArvDtUtc` | `zoneIdFor(arvArp)` |

- Offset via existing `getTimezoneOffset(utcInstant, ianaZone)` (DST-aware).
- Display format: `({sign}{h}:{mm})` — hours **not** zero-padded, minutes two digits; examples `(-4:00)`, `(+8:00)`, `(-2:30)`, `(+0:00)` for UTC.
- If zone or instant missing → header without parentheses: `Departure — YYZ`.
- Ensure airport timezone map `load()` when dialog opens if not yet loaded.
- Shared Live + Scenario dialog path.

## Non-goals

- Do not change STD/STA/ATD/ATA time values (remain UTC display).
- Do not add IANA zone name to the label.

## Implementation

- Pure helpers: `formatUtcOffsetLabel(offsetMinutes)` + `airportOffsetSuffix(airport, instantIso, zoneIdFor)`.
- Wire headers in `flight-detail-dialog.tsx`.
- Vitest for format + DST sample (America/Toronto on Sep date → -4:00 EDT).

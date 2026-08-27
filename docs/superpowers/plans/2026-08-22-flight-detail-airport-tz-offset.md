# Flight Detail airport TZ offset Implementation Plan

> Inline execution. Checkbox steps for tracking.

**Goal:** Show `Departure — YYZ (-4:00)` / `Arrival — YVR (-7:00)` using airport IANA zone at STD/STA.

**Architecture:** Pure format helpers + `getTimezoneOffset` + `useAirportTzStore`; wire dialog headers.

## Task 1: Helpers + Vitest

- Create `gantt/src/components/flight/format-airport-utc-offset.ts`
- Create `gantt/src/components/flight/__tests__/format-airport-utc-offset.test.ts`

```ts
export const formatUtcOffsetLabel = (offsetMinutes: number): string
export const airportOffsetSuffix = (
  airport: string,
  instantIso: string | null | undefined,
  zoneIdFor: (airport: string) => string | undefined,
): string  // '' or ' (-4:00)'
```

## Task 2: Wire dialog

- `load()` airport tz on open
- Headers: `Departure — {dep}{suffix}` / `Arrival — {arv}{suffix}`

## Task 3: Verify Vitest + check:ui

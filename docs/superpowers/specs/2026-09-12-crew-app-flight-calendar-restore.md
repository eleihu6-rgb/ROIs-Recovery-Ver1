# Crew app — restore "airline schedule → iOS Calendar"

Date: 2026-09-12 · Scope: `crew-app/` (React Native, iOS EventKit) · Status: implemented, simulator-validated

## Request

Ryan: *"crew app ver 1, there was a sync airlines sch to ios calendar, bring it back."*

## What existed (v1, `USE_V2 = false`)

The legacy My Trips screen (`src/features/travel/MyTripsScreen.tsx`) put a calendar
icon on every upcoming flight card. One tap wrote the **whole duty** into the
device's default iOS calendar — the Wake Up / Get Ready, Leave Home and Check-in
markers plus one block per leg (`buildDutyCalendarEvents`, option A3) — and the
icon turned into a tick; a second tap deleted exactly those events again (option D1).
State lives in `flightCalendarSlice` (`@royce_flight_calendar`).

The v2 redesign (`USE_V2 = true`) replaced that screen with
`src/features/v2/ScheduleScreen.tsx` and dropped the icon. The slice, the pure
event builder and the native `CalendarModule.saveEvents/removeEvents` bridge all
still exist and are still hydrated on launch — only the entry point was lost.

## Decision

Restore the feature in the v2 UI instead of the legacy screen, and keep one
shared implementation:

1. **Schedule ▸ Timeline, first leg of a duty** — the v1 calendar icon
   (`cal` → `calcheck`) in the flight card header. Shown only on the duty's first
   leg (the markers are duty-level, anchored to the first leg) and only for today
   or a future day (a flown duty is not worth calendaring, matching v1's rule).
2. **Trip Details** — a labelled row (`Add to iPhone Calendar` / `In your iPhone
   Calendar`) so the action is also discoverable on the duty page.

Both call one hook, `useDutyCalendar()` (in `src/features/v2/useV2.ts`), over the
existing `toggleDutyCalendar` thunk. Alert copy moves into a pure, testable
`describeCalendarToggle()` shared with the legacy screen.

## Correctness fix this forces (feedback loop)

`CalendarModule.getEvents` (the meetings reader) and the native
`MeetingBackgroundSync` both scan **every** calendar for events and treat them as
Outlook/Exchange meetings. Events we write would therefore come straight back as
"meeting" cards on the Schedule tab and arm a meeting alarm.

v1 had the same latent loop. Fix it at the source: every event we write carries
`EKEvent.url = royce://flight/<dutyId>`, and both readers skip that scheme. The
URL field is the one EventKit attribute that is neither a user-facing title nor
notes text.

## Verification

- `npx tsc --noEmit` — **PASS**
- `npx jest` — **PASS** (74 suites / 679 tests), incl. four new suites:
  `dutyCalendarMessages`, `scheduleFlightCalendar`, `tripDetailsCalendar`,
  `meetingCalendarFilter`.
- iOS Simulator (iPhone Air, iOS 26.5), rebuilt with the Swift changes and the
  calendar permission granted:
  - TG crew 35459 — `maestro test .maestro/v2_tg_flight_calendar.yaml` — **PASS**
    (icon → "Added to Calendar · 5 entries" → tick → Trip Details row reads
    "In your iPhone Calendar" → removed again).
  - ET crew J4002 (API adapter) — `maestro test .maestro/v2_et_flight_calendar.yaml`
    — **PASS** (second carrier; add + remove from the Schedule card).
  - Screenshots `docs/assets/screenshots/crew-app/v2-{tg,et}-flight-calendar-Ver1-*.png`;
    the simulator's `Calendar.sqlitedb` held exactly the five
    `royce://flight/<pairingId>` rows while added and zero after removal.
- ESLint: no config in `crew-app/` (pre-existing) — not run.

### Residue / caveats

- The **first** ET attempt failed mid-flow (the ET-only keychain LogBox overlay
  swallowed a tap), after the write had landed. Those five `royce://flight/151585`
  rows are orphaned in the simulator's calendar: the app can only delete what its
  own persisted id-map knows about, and that run's map was cleared by the next
  `clearState`. Harmless simulator residue; erase the simulator's content to
  remove it.
- `crew-app/CLAUDE.md` is stale (it still points at `rn-app/` with APP_VERSION as
  a "1 → 2" file); the live app is `crew-app/` with `src/version.ts`.

## Non-goals

- Android (EventKit is iOS-only; the hook degrades to the existing
  "Not available" message).

## Phase 2 (Ryan's choice "B") — Profile ▸ Preferences ▸ Sync switch

The approved v2 mock (`Ver8/9`) always carried an **"iOS Calendar sync"** toggle in
Preferences ▸ Sync; the shipped screen had only "Connected accounts: None". Ryan
asked for that switch as the master control, with the per-duty icon kept as the
fine-grained one.

- `flightCalendarSlice` grows `syncAll`, `syncing` and `hydrated` state plus
  `setCalendarSyncAll(enabled)` and `topUpCalendarSync()`.
  - **on** → write every upcoming duty inside a **60-day horizon** that the app
    isn't already tracking (idempotent, so a duty the crew added by hand from a
    flight card is never written twice), persist the ids + the flag.
  - **off** → delete every entry the app wrote and forget the map.
  - `hydrated` exists so the launch top-up can never run against an empty id-map
    (which would duplicate the whole calendar); it is set only after
    `loadFlightCalendar()` has read both keys.
- `App.tsx` runs `topUpCalendarSync()` once hydration finishes and again whenever
  `trips` changes, so duties published by a later roster capture are added
  automatically. It is silent — the crew is only alerted when they flip the
  switch.
- Copy lives in the pure, testable `describeCalendarSync()`.

### Phase-2 verification (same simulator, TG 35459)

| Step | Evidence |
|---|---|
| switch **on** | alert "Calendar sync on — 15 entries added … across 3 duties"; `Calendar.sqlitedb` held exactly **20** `royce://` rows (15 new + the 5 known ET orphans) |
| relaunch with the switch on | top-up ran silently and the DB stayed at **20** — no duplicates |
| switch **off** | alert "Calendar sync off — 15 entries removed"; DB back to the 5 orphans |

`maestro test .maestro/v2_tg_calendar_sync.yaml` — **PASS**; screenshots
`docs/assets/screenshots/crew-app/v2-tg-calendar-sync-Ver1-*.png`.

# Crew App v2 redesign — implementation record

Date: 2026-09-11 · Scope: `crew-app/` (React Native) · Status: implemented, simulator-validated

## Source of truth

The approved interactive mock (Ver9): https://claude.ai/code/artifact/9c35a935-d2f2-4761-b98f-60b97b82aab1
(file: session scratchpad `crew-app-mock.html`; reference screenshots under `docs/assets/screenshots/crew-app/redesign-Ver*.png`).
Design iterations Ver1→Ver9 were reviewed by Ryan in-chat; this build mirrors Ver9.

## Mapping — mock element → app file

| Mock | App |
|---|---|
| `:root` palettes (sia / thai / emerald / graphite / altair) | `src/theme/carrier.ts` — `PALETTES`, `presetForAirline` (TG→sia, ET→emerald), `CarrierContext` |
| `.screen` gradient + `.sky` texture (ring · dashed path · faceted jet) | `src/components/v2/GradientScreen.tsx` |
| `<symbol id="i-…">` outline icon set (34) | `src/components/v2/icons.tsx` — `Icon name=…` |
| White carrier logos (Thai mask SVG · Ethiopian PNG) · Altair compass | `src/components/v2/BrandLogo.tsx` + `src/assets/brand/ethiopian-airlines-white.png` |
| Ticket card with half-hole cut-outs at the dashed line | `src/components/v2/TicketCard.tsx` (`TicketCard`, `DashedLine`) |
| `#113` pill dock (active tab = lighter pill + label) | `src/components/v2/PillDock.tsx` (custom `tabBar`) |
| Toggle / chip / nav / radio rows, section labels | `src/components/v2/rows.tsx` |
| `#700` Login (Altair ground, airline picker, crew ID, password, keep-me) | `src/features/auth/LoginScreen.tsx` (restyled in place; logic untouched) |
| Home `#100–#114` | `src/features/v2/HomeScreen.tsx` |
| Schedule `#200–#209` (month list · synced date strip · one card per day) | `src/features/v2/ScheduleScreen.tsx` |
| Global `#300–#301` | `src/features/v2/GlobalScreen.tsx` |
| Profile `#400–#407` | `src/features/v2/ProfileScreen.tsx` |
| Full pages `#600`: Trip Details · Upcoming Alarms · Alarms & Meetings · Time Zone · Preferences · Personal Info | `src/features/v2/{TripDetails,UpcomingAlarms,AlarmsSettings,TimeZone,Preferences,PersonalInfo}Screen.tsx` |
| Quick-action & info pages (`PAGES` map) | `src/features/v2/SpecPage.tsx` (data-driven) |
| Navigation (4 tabs + slide-in stack) | `src/features/v2/V2Navigator.tsx`; `RootNavigator.tsx` `USE_V2 = true` (legacy `MainTabs` retained until sign-off) |
| View model (greeting bands, next trip, month model, ready/leave/check-in) | `src/features/v2/model.ts`, `useV2.ts` |

## Data wiring (no new state; existing slices only)

- Trips/legs: `trips.trips` (`Trip`/`TripLeg`); ground duties: `duties.duties` → `classifyGroundDuties`.
- Ready / Leave home: `computeEffectiveAlarms` (alarms slice hours + per-duty overrides) — same numbers the legacy trip cards showed.
- Check-in: `trip.checkInDateUTC` → `checkInHhmm`. Times honour `settings.timeZoneMode` / `baseTimeZone` via `formatLegTime` / `legDisplayDate`.
- Meetings: `meetings.meetings` (EventKit) placed on their day cards; reminders in Upcoming Alarms.
- Alerts bell: `notifications.notifications.length`; opens the existing `NotificationsScreen`.
- Greeting: device clock only (documented in `model.ts`) — independent of the Time Zone display mode.
- Carrier ground/logo: `auth.airline`.

## Settings re-homed from legacy ProfileScreen

Clock Setup (master toggle, Get Ready, Leave Home, scheduled list, test alarm) and Meetings (toggle, reminder, Dynamic Island countdown + lead) → **Alarms & Meetings** page; Time Zone picker → **Time Zone** page; Language / Appearance / Connected accounts / Version / explore prefs → **Preferences** page. Same actions: `setEnabled`, `setGlobalAlarmHours`, `setMeetingsEnabled`, `setMeetingMinutes`, `setIslandCountdown`, `setIslandLeadMinutes`, `setTimeZoneMode`, `setExplorePrefs`.

## Known gaps (mock content without a backing feature yet)

Crew rank / fleet (status line shows airline · crew ID · base), gate, pairing id, credit (shown as rounded block hours), leave balance, documents, expense claims, duty/rest limits, Face ID toggles — presented as in the mock via `SpecPage`, values `—` where the roster carries nothing. Quick-action CTAs confirm with an alert; no backend calls.

## Verification

- `npx tsc --noEmit` — PASS
- `npx jest` — 45 suites / 427 tests PASS (incl. new `__tests__/features/v2Model.test.ts`, which caught the `Boeing 787` → `B787` bug before the sim run)
- Simulator (iPhone 17, iOS 26.5): `maestro test .maestro/v2_tg_login.yaml` and `.maestro/v2_et_login.yaml` — see screenshots `docs/assets/screenshots/crew-app/v2_tg_*.png`, `v2_et_*.png`
- iOS Calendar → app sync (simulator): `xcrun simctl privacy <udid> grant calendar org.reactjs.native.example.RoyceTravelTemplate`, then `maestro test .maestro/v2_tg_meetings.yaml` (dev action *Preferences ▸ Add demo meetings* writes 4 events via EventKit, turns Meetings on) + `.maestro/v2_tg_meetings_sched.yaml` — evidence `v2_tg_m1..m4*.png`; the native AlarmKit meeting alarm fired in the Dynamic Island: `v2_tg_m5_dynamic_island_alarm.png`.
- Simulator caveats: the kept-login session and the ET session don't persist across relaunch (simulator keychain) — flows sign in again; the Mac's own calendars had no upcoming events, so meetings were seeded rather than synced from macOS.
- `APP_VERSION` 99 → 101
- ESLint: no config present in `crew-app/` (pre-existing); not run.

# Crew app Daylight and Duo layout audit — 2026-10-09, Ver1

## Scope and observed result

- Daylight uses neutral gray content surfaces, dark text, blue actions, and a muted light MapKit style on Check-In. The route map retains its dark cartographic canvas with white statistics text.
- Dark appearance was visually checked on Home, Profile, Preferences, Appearance, Route map, Trip details, Schedule, and Check-In. The dark Check-In map style remains active.
- Duo inner landscape puts the main tab navigation in the lower right safe-area action rail. Schedule view selection occupies the upper part of that rail. Profile entry points use the existing rail, and stack pages hide the main navigation. Duo outer portrait Schedule also puts view selection in the right rail.
- Home omits the Rotation summary because Trip details contains it. The Trip details action is compact, landscape shows more destination cards, and portrait keeps destination cards on one horizontal row.
- The final two same-day flight cards in the wide Schedule timeline share a row and use the same card width as earlier days.

## Native UI evidence

Screenshots were captured from iOS Duo simulators and visually inspected:

- `docs/assets/screenshots/crew-app/duo-home-dark-final-Ver1.png` — final v193 integrated Home and navigation rail.
- `docs/assets/screenshots/crew-app/duo-schedule-dark-final-Ver1.png` — final v193 Schedule and navigation rail.
- `docs/assets/screenshots/crew-app/home-landscape-destination-grid-Ver5.png` and `home-portrait-destination-row-Ver1.png` — destination layouts.
- `docs/assets/screenshots/crew-app/schedule-daylight-last-two-flights-row-Ver1.png` and `schedule-dark-last-two-flights-row-Ver1.png` — paired last-day flights.
- `docs/assets/screenshots/crew-app/schedule-outer-daylight-rail-Ver2.png` and `schedule-outer-daylight-calendar-rail-Ver1.png` — outer portrait rail and view switching.
- `docs/assets/screenshots/crew-app/checkin-daylight-map-Ver1.png` and `checkin-dark-map-Ver1.png` — Check-In maps.
- `docs/assets/screenshots/crew-app/route-map-daylight-grey-Ver1.png`, `route-map-dark-audit-Ver1.png`, `profile-daylight-audit-Ver1.png`, `profile-dark-audit-Ver1.png`, `dialog-daylight-audit-Ver1.png`, and `trip-details-dark-audit-Ver1.png` — appearance regression samples.

## Verification

- `./node_modules/.bin/tsc --noEmit --project /tmp/crew-light-source-tsconfig.json` — PASS, source type check.
- `npm run check:ui` at repository root — PASS, no hard violations; 124 existing warnings.
- `git diff --check` — PASS.
- Focused Home (41), Check-In (12), navigation (52), and root Schedule/light (76) Jest tests — PASS.
- `npm test -- --runInBand --silent` in `crew-app` — FAIL: 5 calendar-related suites, 16 tests; 101 suites and 954 tests passed. Failures are in `scheduleFlightCalendar`, `scheduleMeetings`, `upcomingAlarms`, `preferencesCalendarSync`, and `calendarSync`. These failures preceded the last layout integration; the full suite is not green.

The app is native React Native on the Duo simulator. The repository's real-UI Playwright gate cannot drive this native screen; simulator interaction and screenshots were used for visual verification. No authenticated live airline account flow was exercised in this pass. The user's Check-In request ended with an empty item “2.”; only the stated map-style change was applied.

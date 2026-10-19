# Daily calendar fixed rail validation — 2026-10-19

> Historical receipt. The later user clarification supersedes the pinned-rail scroll requirement; see `2026-10-19-calendar-shared-scroll-Ver1.md` for current shared-scroll validation.

## Reference inspection
Used iphone-use on physical iPhone, Finalist October 19–25. Reference screenshots: `docs/assets/screenshots/crew-app/finalist-reference-oct19-25-Ver1/`.

Observed list scrolling up/down with unchanged right-rail position. Folding Morning removes rows, retains a count and leaves rail unchanged. Folding carries across selected dates. Empty dayparts remain available. Rail spans sit on one centerline with darker overlapped intervals. Right-side rotated durations describe gaps. The reference shows a daytime-focused window, including 09 in some captures; the user explicitly requests unpadded hour numbers. Crew implementation compresses quiet early hours while retaining any actual early activity; this is not a claim of identical internal Finalist scaling.

Additional gaps outside the implemented calendar scope: Finalist's daily goal, personal journal/notes, habits, focused-time editor, paper texture/font, bottom navigation and task completion. These are not implemented as nonfunctional imitations. Do not claim full pixel parity.

## Automated receipts
- Before fix: `cd crew-app && npx jest __tests__/features/calendarDailyInteraction.test.tsx --runInBand --silent` — FAIL, 2 tests (missing folding and independent event scroller).
- After fix: `cd crew-app && npx jest __tests__/features/calendarDailyInteraction.test.tsx __tests__/features/calendarMonthDetail.test.tsx __tests__/features/calendarWeatherState.test.tsx __tests__/features/weatherModule.test.ts __tests__/features/scheduleRosterViews.test.tsx --runInBand --silent` — PASS, 28 tests (including contrast and pending-request reuse regressions).
- `cd crew-app && npx tsc --noEmit` — PASS.
- `npm run check:ui` — PASS, 0 hard violations, 124 existing warnings.
- Native `xcodebuild build-for-testing -workspace crew-app/ios/RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -configuration Release -destination 'id=F23C57EF-0893-45F5-B161-31E3988FFE59' -derivedDataPath /tmp/crew-calendar-finalist -parallel-testing-enabled NO ONLY_ACTIVE_ARCH=YES ARCHS=arm64 CODE_SIGNING_ALLOWED=NO` — PASS. Swift WeatherKit hourly bridge compiles.

## Native UI receipts
Dedicated devices and build directory isolate this task from duty-swap work. No other agent's simulator was reused or stopped. Completed dedicated Air and Duo simulators were deleted after preserving captures to recover disk space. Max two booted devices respected. Release bundle avoids a shared Metro server. Disk-full install was recovered by deleting only this task's generated intermediate/module caches.

- Air `F23C57EF-0893-45F5-B161-31E3988FFE59`: `DuoFitUITests.testCalendarFixedRailAndFolding` PASS, seven dates October 19–25, 125.711 seconds. Final inspected captures: `docs/assets/screenshots/crew-app/calendar-fixed-air-Ver4/`. Earlier runs exposed and corrected row contrast, chevron direction and gap/hour-label collision.
- Duo portrait: PASS, 162.002 seconds; landscape: PASS, 160.514 seconds. Seven dates in each orientation; captures inspected under `calendar-fixed-duo-portrait-Ver1/` and `calendar-fixed-duo-landscape-Ver1/`.
- iPad portrait: PASS, 127.242 seconds; landscape: PASS, 128.597 seconds. Seven dates each; captures inspected under `calendar-fixed-ipad-portrait-Ver1/` and `calendar-fixed-ipad-landscape-Ver1/`.
- Month + day / Week + day: Maestro PASS on iPad landscape. Final captures inspected in `docs/assets/screenshots/crew-app/calendar-month-ipad-Ver2/`. Earlier flow attempts corrected a selected-date toggle and unsupported absolute screenshot output. Ver1 visual review caught unwanted blank space under the week grid; `flexGrow: 0` fixes that, verified in Ver2. Month event scroll captures show the rail remaining in place.
- Signed PR/TG account run: BLOCKED. PR portal `https://crew-pal-sea-tst.roiscloud.com` returned HTTP 502 from Microsoft Azure Application Gateway. Guest runs use seeded EventKit events; they do not prove roster account isolation.

Reproduction (replace device, shot directory, version and route for the device):
```sh
TEST_RUNNER_CALENDAR_FIXED_GUEST=1 \
TEST_RUNNER_CALENDAR_FIXED_VERSION=4 \
TEST_RUNNER_CALENDAR_FIXED_SHOT_DIR="$PWD/docs/assets/screenshots/crew-app/calendar-fixed-air-Ver4" \
TEST_RUNNER_SEED_FINALIST_OCT14=1 TEST_RUNNER_ROUTE_DEVICE=air \
xcodebuild test-without-building \
  -workspace crew-app/ios/RoyceTravelTemplate.xcworkspace \
  -scheme RoyceTravelTemplateUITests -configuration Release \
  -destination 'id=F23C57EF-0893-45F5-B161-31E3988FFE59' \
  -derivedDataPath /tmp/crew-calendar-finalist -parallel-testing-enabled NO \
  -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testCalendarFixedRailAndFolding \
  CODE_SIGNING_ALLOWED=NO
```
Duo uses `duoctl -d <dedicated-device> rotate portrait|landscape`, verified inner-display state, and `crew-app/ios/scripts/duo-shot-watcher.sh <device> <shot-dir>` with `TEST_RUNNER_DUO_SHOT_DIR` pointing to that directory. These capture display 3 during the test via its request/done handshake. Non-Duo orientation uses `TEST_RUNNER_CALENDAR_ORIENTATION=portrait|landscape`.

Assertions: selected day heading, rail height and dock clearance, fold/unfold, list scrolling up/down with unchanged rail position and height. Native XCUITest is the app's real-UI gate; browser Playwright cannot drive this native React Native surface. Standalone day mode is covered by the seven-day test; month-plus-day grid sizing receives a separate UI check.

Review refinements: cap the selected-day month grid in its own scroll area so six-week grids cannot take all the event space; keep base-wide pending WeatherKit requests alive across selected-date changes. The helper agent supplied weather tests and a read-only audit; primary agent reviewed them. Suggested separate overlap lanes were rejected because the user explicitly requires a shared centerline.

Weather success in a signed physical app is still unverified; simulator may report entitlement/service unavailable. Failure/retry, weekly outlook, daypart hours, date-range and base-switch behavior are covered with mocked WeatherKit responses. No fabricated forecast fallback. Apple API reference: https://developer.apple.com/documentation/weatherkit/weatherservice.

## Manual cases
1. In Month + day, Week + day and standalone day details, scroll a crowded event list both directions. The right rail must not move or resize.
2. Fold Morning/Afternoon/Evening, check count and hidden rows; unfold and verify restored event order. Rail spans remain present throughout.
3. Quiet date: retain empty dayparts, suppress quiet early hour labels. Early flight date: retain the real intervals. Hour numbers have no leading zero.
4. Two overlapping events: same horizontal center; only intersecting interval is darker. Nonoverlapping tails keep their normal color.
5. Weather: real base-labeled Apple forecast, condition glyphs, up to seven available dates, hourly daypart weather when returned, legal attribution. Offline/native error exposes Retry. Dates outside forecast range do not fabricate weather.
6. Switch PR to TG and back; no prior-base forecast or prior-crew roster may flash. Repeat on Air, Duo and iPad portrait/landscape.

## Final month/week reproduction
```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
maestro --device 7E49F844-7A26-491A-ABBE-40F3CD57D5B7 test \
  --test-output-dir /tmp/calendar-month-maestro-Ver4 \
  crew-app/.maestro/calendar_fixed_month_guest.yaml
```
PASS. Copied only this run's `takeScreenshot/*.png` into the versioned repository screenshot directory and visually inspected them. After the grid-height refinement, focused Jest suite remained PASS (28 tests), UI gate PASS (124 existing warnings), and `git diff --check` PASS. The final JS bundle was installed in the dedicated iPad for that run; the earlier five standalone-day native runs cover the unchanged standalone view. No claim of signed-device weather success, live account isolation, or full Finalist pixel parity.

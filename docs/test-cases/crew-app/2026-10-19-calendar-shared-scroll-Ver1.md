# Daily calendar shared vertical scroll — 2026-10-19

## Current acceptance
The user clarified after a TestFlight screenshot: swipe up moves events and rail up; swipe down moves both down; keep rail height fixed and leave no blank space above the daily panel. This supersedes the earlier viewport-pinned rail requirement.

One vertical ScrollView now contains the event column and the rail. The rail uses the measured daily viewport height, independent of list content, fold state and scroll offset. Vertical bounce is disabled so pulling past either end cannot reveal empty overscroll space. The compact calendar grid retains `flexGrow: 0`, preventing the week row from reserving a month-sized blank area. Rail center alignment, overlap shading, plain hour labels and weather logic are unchanged. Local app version: 231; no TestFlight upload performed in this task.

## Regression and build checks
- Before fix: `cd crew-app && npx jest __tests__/features/calendarDailyInteraction.test.tsx --runInBand --silent` — FAIL, missing shared scroll container.
- After fix: `cd crew-app && npx jest __tests__/features/calendarDailyInteraction.test.tsx __tests__/features/calendarMonthDetail.test.tsx __tests__/features/calendarWeatherState.test.tsx __tests__/features/weatherModule.test.ts __tests__/features/scheduleRosterViews.test.tsx --runInBand --silent` — PASS, 5 suites / 28 tests.
- `cd crew-app && npx tsc --noEmit` — PASS.
- `npm run check:ui` — PASS, 0 hard violations / 124 existing warnings.
- `git diff --check` — PASS.
- Native Release `xcodebuild build-for-testing` — PASS using the workspace/scheme/destination below, `ONLY_ACTIVE_ARCH=YES ARCHS=arm64 CODE_SIGNING_ALLOWED=NO`.

## Real native UI
Test: `DuoFitUITests.testCalendarSharedScrollAndFolding`. For October19–25, fold/unfold, swipe up/down, assert unchanged rail height and equal event/rail movement; on scrollable dates assert actual movement in both directions. Month/week modes additionally assert the day heading is within 32pt below the grid, then capture before/after scrolling.

- Air portrait: PASS, 152.114 seconds. Dedicated `1B11CFF3-0496-4AC4-A8B2-BFD06E10A0C7`. Captures inspected in `docs/assets/screenshots/crew-app/calendar-shared-air-Ver1/` (day19-scrolled and week-top).
- Duo landscape: PASS, 189.390 seconds. Captures inspected in `docs/assets/screenshots/crew-app/calendar-shared-duo-Ver1/`.
- iPad landscape: PASS, 161.885 seconds. Captures inspected in `docs/assets/screenshots/crew-app/calendar-shared-ipad-Ver1/`.

Reproduction:
```sh
TEST_RUNNER_CALENDAR_FIXED_GUEST=1 \
TEST_RUNNER_CALENDAR_FIXED_VERSION=1 \
TEST_RUNNER_CALENDAR_FIXED_SHOT_DIR="$PWD/docs/assets/screenshots/crew-app/calendar-shared-air-Ver1" \
TEST_RUNNER_SEED_FINALIST_OCT14=1 TEST_RUNNER_ROUTE_DEVICE=air \
xcodebuild test-without-building \
  -workspace crew-app/ios/RoyceTravelTemplate.xcworkspace \
  -scheme RoyceTravelTemplateUITests -configuration Release \
  -destination 'id=1B11CFF3-0496-4AC4-A8B2-BFD06E10A0C7' \
  -derivedDataPath /tmp/crew-calendar-finalist -parallel-testing-enabled NO \
  -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testCalendarSharedScrollAndFolding \
  CODE_SIGNING_ALLOWED=NO
```
Duo uses its own UDID, `TEST_RUNNER_ROUTE_DEVICE=duo`, verified `duoctl` landscape inner display and the host screenshot watcher with `TEST_RUNNER_DUO_SHOT_DIR`. iPad uses `TEST_RUNNER_ROUTE_DEVICE=ipad TEST_RUNNER_CALENDAR_ORIENTATION=landscape`. Screenshot folder/environment names retain the old FIXED prefix for compatibility, but assertions now implement shared movement.

## Limits
PR portal rechecked with `curl -I --max-time 15 -sS https://crew-pal-sea-tst.roiscloud.com`: still HTTP502 from Azure Application Gateway. Native tests therefore use guest mode and seeded EventKit events; PR/TG account switching and live signed-device WeatherKit success remain unverified. No deployment, commit or push. Only this task's dedicated simulators are operated; other agent's devices remain untouched.

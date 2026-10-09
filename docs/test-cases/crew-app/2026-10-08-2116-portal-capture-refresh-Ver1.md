# PR 452320 portal refresh loop — v174

## Cause and correction

The v173 login guard handled rejection, but did not guard `gotoRoster`. Native authentication provides a token to direct API calls without signing in the portal SPA. On PR's account-choice screen, the absence of a password input was incorrectly treated as a completed browser login. Navigating to roster then redirected to login and restarted the document capture. Native capture now remains on its original document and fetches the nine month payloads once.

The capture screen also reset its import timer for every captured JSON response. Unrelated traffic could indefinitely postpone importing an already parsed roster. Native capture now schedules only on roster responses, counts unique URLs, and never moves the deadline later. All payloads can shorten the deadline to 600ms; the existing 4-second partial-roster fallback remains. Manual and automatic completion share a one-shot guard. Other portal endpoint names retain their existing automatic capture path.

## Regression evidence

- Executable generated-script test reproduced the unexpected login→roster navigation before the fix, then passed with the document unchanged and nine fetches across repeated polling.
- Rendered capture test reproduced zero imports after 4.5s of unrelated chatter before the fix, then passed.
- Nine changing responses at one URL do not count as nine completed endpoints; continued roster updates cannot extend the original deadline.
- The supporting agent drafted capture-timing tests. Primary review strengthened the duplicate-URL case to actually send nine distinct responses before the fast-completion deadline, and reran the suite.

From `crew-app/`:
```sh
npx --no-install jest __tests__/features/portalLoginAttempts.test.ts __tests__/features/portalCaptureCompletion.test.tsx __tests__/features/portalLoginFailure.test.tsx __tests__/features/portalCapture.test.ts __tests__/features/portalInjectedJs.test.ts --runInBand
```
PASS: 5 suites/50 tests (`/tmp/portal-refresh-green-final.log`).

`npm run check:ui` from root — PASS, 0 hard violations/124 existing warnings.
`npx --no-install tsc --noEmit` — FAIL only in existing unrelated dutySwapMarket, myDutyScreen, myTripsTabs, NotificationsScreen and TripCards tests; no new capture errors.

## Native verification

Target is the user's active iPhone Duo — Test, `08ACE4EC-2508-4DD8-9989-461C1DEF4D72`. No additional simulator was started.

Release build command from `crew-app/ios/`:
```sh
xcodebuild build-for-testing -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -configuration Release -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/crew-route-sim-156 -jobs 2 ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO
```
PASS (`/tmp/portal-refresh-build174.log` and final `/tmp/portal-refresh-build174-final.log`).

Native test command:
```sh
TEST_RUNNER_CALENDAR_REQUIRE_AUTO_IMPORT=1 bash /tmp/run-calendar-ui.sh duo 08ACE4EC-2508-4DD8-9989-461C1DEF4D72 452320 9 landscape
```
The existing wrapper runs `xcodebuild test-without-building`, `-parallel-testing-enabled NO`, and `-only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testCalendarMonthDetailCrews`. The new runner flag prevents the helper from pressing Use roster, so reaching Home proves automatic completion. It then checks PR profile identity/calendar/day details and switches to TG.

PASS: PR452320 automatic login, calendar/day checks and TG regression; one executed native test, 350.193 seconds (`/tmp/calendar-duo-Ver9.log`). Manual Use roster was disabled. Home screenshot captured during the same native run and visually inspected: `docs/assets/screenshots/crew-app/portal-452320-auto-import-home-Ver1.png` (PR535/PR536 MNL→CGK→MNL rotation). Before-state: `docs/assets/screenshots/crew-app/portal-452320-refresh-before-Ver1.png`.

Native UIKit is driven with XCUITest; the literal Playwright gate is unavailable. No commits/pushes.

Primary visually inspected `docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-month-detail-grid-Ver9.png`: PR duties populated, calendar mode available after automatic import. Final source preserves the non-ROIS portal path and has a passing focused regression for its differently named endpoints.

Final recovery run uses `xcodebuild test-without-building` with the same target/build flags and `-only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testPortalAutomaticImportPR452320`, `TEST_RUNNER_CALENDAR_REQUIRE_AUTO_IMPORT=1`. It switches back from TG to 452320 and leaves Home open. PASS: one executed test, zero failures (`/tmp/portal452320-auto-final-Ver2.log`). Profile and Home screenshots `portal-452320-auto-import-profile-Ver2.png` and `portal-452320-auto-import-home-Ver2.png` under `docs/assets/screenshots/crew-app/` visually inspected: exact PR452320 identity and loaded rotation. User Duo remains open on this crew; only this task’s screenshot watcher was stopped.

# Calendar stacked / month-detail verification

## Implemented behavior

- Schedule → Calendar → Stacked: compact seven-column month with simple duty glyphs and a separate selected-day agenda; selecting the date again restores the month agenda.
- Month detail: up to three labeled previews per date, departure times, and +N overflow. Tap any date for all of its details, including empty dates.
- Every device/orientation: Month detail uses the full screen width, with no right-side day pane. Selecting a date replaces the month with full day details; Back preserves Month detail and the selected date.
- Full details and Hourly timeline are alternatives, switched through the visible control. Stacked retains its separate agenda presentation.
- Seven weekday headings and each week are separate flex rows, preventing fractional percentage widths from wrapping Saturday.
- Overnight flight arrival time includes the existing arrival-day offset (for example +1).

## Automated receipts

From `crew-app/`:

```sh
npx --no-install jest __tests__/features/calendarMonthDetail.test.tsx __tests__/features/schedRosterViews.test.ts __tests__/features/scheduleRosterViews.test.tsx __tests__/features/duoPageLayouts.test.tsx --runInBand
```

PASS: 4 suites, 78 tests. Covers crowded days (two-leg MNL→CEB→MNL rotation plus four meetings), +3 overflow, complete day content, details/hourly switching, empty days, return state, six-week/31-day month, and Air portrait/landscape, Duo tall/wide, and iPad portrait/landscape. Every size asserts the month has no adjacent day pane.

From repository root: `npm run check:ui` — PASS, 0 hard violations (124 existing warnings).

From `crew-app/`: `npx --no-install tsc --noEmit` — FAIL outside changed calendar code: existing test errors in dutySwapMarket, missing react-test-renderer typings for myDutyScreen / myTripsTabs / NotificationsScreen / TripCards, and NotificationsScreen callback implicit-any parameters. No CalendarView/calendarMonthDetail errors reported.

From `crew-app/ios/`:

```sh
xcodebuild build-for-testing -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -configuration Release -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/crew-route-sim-156 -jobs 2 ARCHS=arm64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO
```

PASS (`/tmp/calendar-build-login-guard.log`), including calendar and login rejection changes. A prior attempt encountered a transient missing generated React Native C++ file during another build's regeneration; retry succeeded.

## Native UI matrix

Test method: `RoyceTravelTemplateUITests/DuoFitUITests/testCalendarMonthDetailCrews`.
It drives actual login, checks profile identity, switches both calendar modes, checks all seven weekday frames, selects a populated flight date, verifies the flight in full details and hourly timeline, returns to the monthly view, navigates months, and finally switches to TG 35459.

| Target | PR crew IDs | State |
|---|---|---|
| Air portrait | 452320, 487424, 540753 | PR assertions passed in Ver3; Ver4 PR 487424 + TG passed (228.253s); before final full-width/density revision |
| Air landscape | 487424 + TG | Final full-width Ver7 PASS (241.082s) |
| iPad landscape | 473006, 563044 + TG | 473006 calendar assertions passed in Ver3; 563044 + TG Ver5 PASS (251.271s); 486541 skipped |
| Duo landscape | 465800, 479274 + TG | Final full-width Ver7 PASS (634.770s); earlier Ver5 covered 532510/493065 interactions |
| Duo portrait | 532510, 493065 + TG | Final full-width Ver8 PASS (397.243s) |
| iPad portrait | 473006 + TG | Final full-width Ver6 PASS (223.665s) |

Resource constraint confirmed by Ryan: run Air, then Duo, then iPad; shut down inactive simulators and do not start concurrent runs. The service recovered without a global restart.

All three earlier Ver2 runs returned `Unable to find a device matching the provided destination specifier`; `simctl list devices` also hung. The shared simulator service became unresponsive while other sessions were active. Do not call this a UI PASS or a feature-complete device validation.

Air Ver3 passed all calendar assertions for PR 452320, 487424 and 540753, but the TG control initially expected flights in October. Existing route-map validation documents that TG 35459 publishes September. The native test now selects September through the actual previous-month button before asserting TG flight content. This is a test-fixture correction; no calendar product change was needed.

The first Air run reached PR 452320 and captured:
- `docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-stacked-month-Ver1.png`
- `docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-month-detail-grid-Ver1.png`
- `docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-selected-day-Ver1.png`

These were visually inspected and exposed the six-column wrapping and duplicated day presentation; both were corrected in source afterward. Ver1 captures are historical failing evidence, not proof of the final UI.

### Re-run command

Set `TEST_RUNNER_ROUTE_DEVICE=air|ipad|duo`, `TEST_RUNNER_ROUTE_CREWS` to the appropriate comma-separated IDs, `TEST_RUNNER_CALENDAR_SHOT_VERSION` to an unused version, and `TEST_RUNNER_DUO_SHOT_DIR` (Air/Duo) or `TEST_RUNNER_IPAD_SHOT_DIR` (iPad) to the absolute screenshot directory. The test uses the app's prefilled test login; its shared helper requires `TEST_RUNNER_DUO_PR_PASSWORD` but does not type it when `usePrefilledPassword=true`. Supply that environment value through the existing local test setup; never publish credentials. Air and iPad accept `TEST_RUNNER_CALENDAR_ORIENTATION=portrait|landscape`, applied before app launch. Duo needs the documented `duoctl` orientation command and screenshot watcher.

```sh
xcodebuild test-without-building -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -configuration Release -destination "id=$CALENDAR_SIM" -derivedDataPath /tmp/crew-route-sim-156 -parallel-testing-enabled NO -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testCalendarMonthDetailCrews -resultBundlePath "$CALENDAR_RESULT" CODE_SIGNING_ALLOWED=NO
```

Air UDID: `D8409020-8121-4F25-AC0F-A6C1ABA9B12F`.
Isolated calendar iPad: `8139D863-D223-4332-893C-1395D2B0C776` (created to avoid other sessions on the shared iPad).
Isolated calendar Duo: `FF3FF365-4B72-4E12-B23A-A8B577FC5ACA`. The shared test Duo was interrupted by another session, so final runs use this dedicated device (never the Release Duo).

Final listed PASS runs each executed the actual test case with nonzero test counts. Fresh screenshots were captured and visually inspected. Playwright cannot drive this native UIKit app; native XCUITest is used, and the repository's literal Playwright gate remains unrun.

A supporting agent drafted the native regression; the primary agent reviewed and corrected its selection, screenshot, mode-return, and geometry assertions before building.

Duo Ver4 passed calendar checks for 465800 and 479274, then failed during captured-roster import for 532510 before reaching its calendar. The import wait was increased to 120 seconds; Ver5 successfully signed in and validated 532510. Native screenshots also revealed ScrollView default flex sizing and the inherited 420-point cap, corrected with explicit flexGrow and maxWidth overrides. That split layout was subsequently superseded by Ryan’s full-width requirement. Final validation asserts the month uses more than 75% of the app width and has no day pane.

## Portal login rejection

Crew 486541 is skipped as instructed. A single diagnostic request through `portalClient` confirmed the exact submitted ID, encrypted password presence and required email-code presence. The portal returned HTTP 200, business code 0, no token and `ERROR_WRONG_PASSWORD`. Safe response: `docs/assets/screenshots/crew-app/portal-auth-486541-response-Ver1.json`. No further login attempts for this crew are authorized by this test run.

The fix makes native auth the sole owner of ROIS authentication, suppresses injected form/direct-auth attempts, rejects stale WebView tokens, bounds fallback form submission, times out native login after 30 seconds, and unmounts the WebView on failure. The failure screen shows the crew ID and Back to login. `crew-app/CLAUDE.md` now requires inspecting identity/credentials/portal response instead of extending a hanging test or cycling retries.

Combined focused verification: `npx --no-install jest __tests__/features/portalClient.test.ts __tests__/features/portalInjectedJs.test.ts __tests__/features/portalLoginFailure.test.tsx __tests__/features/calendarMonthDetail.test.tsx __tests__/features/schedRosterViews.test.ts __tests__/features/scheduleRosterViews.test.tsx __tests__/features/duoPageLayouts.test.tsx --runInBand` — PASS, 7 suites/101 tests. `npm run check:ui` — PASS, 0 hard violations/124 existing warnings. `npx --no-install tsc --noEmit` — FAIL only in the existing unrelated tests listed above.

`npx --no-install jest __tests__/features/portalLoginAttempts.test.ts --runInBand` — PASS, 4 tests. Executes ten polling ticks with queued timers, proves native auth makes no injected submissions and fallback submits once, retains HTTP/business failure fields, and aborts a stalled login. Supporting-agent coverage was reviewed and corrected to actually repeat polling rather than invoke the callback only once; primary-agent rerun passed.

`xcodebuild test-without-building -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -configuration Release -destination 'id=8139D863-D223-4332-893C-1395D2B0C776' -derivedDataPath /tmp/crew-route-sim-156 -parallel-testing-enabled NO -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testPortalLoginRejection -resultBundlePath /tmp/crew-portal-login-rejection-Ver1.xcresult CODE_SIGNING_ALLOWED=NO` — PASS, 1 test/61.318 seconds. Used a synthetic invalid account, not 486541. Asserted exact identity, WebView unmounted, stable failure state, and Back returns to login. Screenshot `docs/assets/screenshots/crew-app/portal-login-rejection-ipad-Ver1.png` visually inspected: legible failure text and recovery control, no portal beneath it.

Final iPad landscape evidence (visually inspected):
- `docs/assets/screenshots/crew-app/calendar-month-detail-ipad-563044-month-detail-grid-Ver5.png` — all five October weeks visible, full-width preview grid, no day sidebar.
- `docs/assets/screenshots/crew-app/calendar-month-detail-ipad-563044-selected-day-Ver5.png` — PR117 YVR→MNL, complete local departure/arrival with +1.

Final device run commands (wrapper sets the documented runner environment and executes the xcodebuild command above):
- `bash /tmp/run-calendar-ui.sh air D8409020-8121-4F25-AC0F-A6C1ABA9B12F 487424 7 landscape` — PASS.
- `bash /tmp/run-calendar-ui.sh duo FF3FF365-4B72-4E12-B23A-A8B577FC5ACA 465800,479274 7 landscape` — PASS; Duo orientation set through duoctl.
- `bash /tmp/run-calendar-ui.sh duo FF3FF365-4B72-4E12-B23A-A8B577FC5ACA 532510,493065 8 portrait` — PASS; Duo orientation set through duoctl.
- `bash /tmp/run-calendar-ui.sh ipad 8139D863-D223-4332-893C-1395D2B0C776 563044 5 landscape` — PASS.

The supporting agent added bounded login tests; primary review corrected the polling simulation and independently reran them. Total focused Jest results: 8 suites/105 tests PASS. TypeScript remains blocked only by the unrelated existing test errors. No commit or push.

- `bash /tmp/run-calendar-ui.sh ipad 8139D863-D223-4332-893C-1395D2B0C776 473006 6 portrait` — PASS, PR and TG (223.665s).
- `docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-month-detail-grid-Ver6.png` and `calendar-month-detail-ipad-473006-selected-day-Ver6.png` visually inspected: all five weeks visible, narrow preview labels truncate cleanly, selected day exposes the complete PR209 MNL→MEL route and overnight arrival.

Final scope: nine requested PR crews reached calendar validation; 486541 skipped for confirmed wrong-password response. Air → Duo → iPad tests were run sequentially by this task. Dedicated Duo and iPad were shut down after use; simulators owned by other active sessions were left untouched. Air portrait receipts predate the final month-density revision, while final Air landscape and both Duo/iPad orientations passed; all six dimensions have focused component coverage. Native UIKit was verified with XCUITest; literal Playwright verification remains unavailable.

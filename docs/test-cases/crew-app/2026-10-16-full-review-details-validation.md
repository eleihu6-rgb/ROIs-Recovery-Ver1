# Review Swap / Compare & Send full details

Version 214. Scope: wrapping review content only; no legality, selection, Gantt-height, or iPad review-folding changes.

Shared `ReviewDetails.tsx` now renders report/end timestamps, composition/rank, duty BLH/CRD/FDP, flight route/times, aircraft and flight BLH, plus published segment FDP/layover. No fixed line limit on these fields. Identical task/segment layovers are not repeated. Scroll areas and existing note/send workflow remain.

Durable simulator rules added to `crew-app/CLAUDE.md`: validate Air → Duo → iPad; maximum two booted, preferably one, coordinating ownership. This validation uses one at a time.

## Automated checks

- PASS: `cd crew-app && npx jest __tests__/features/dutySwap*.test.* --runInBand --silent` — 108 tests, 9 suites.
- PASS: `cd crew-app && npx tsc --noEmit`.
- PASS: `npm run check:ui` — zero hard violations, 124 existing warnings.
- PASS: `git diff --check`.

New focused tests use existing captured multi-leg roundtrip fixtures. Verify all leg metadata and times, duty FDP on compact review, no line limits, both Twin tabs, unchanged note submission callback, record mode and no duplicate layover. Existing Jest configuration warnings remain.

## Native real-UI sequence

Test: `DuoFitUITests/testCompareFullDetailsAndTwinReviewAccountIsolation`. Select real published duties in Matrix, open Compare & Send, inspect complete aircraft/block-hour values, duty FDP and leg times, then inspect Twin By date and Duty details. Verify note/send remain reachable without submitting. Switch to TG and assert no PR draft/data remains.

Air Ver1 passed, 187.769s. Its screenshots revealed duplicated layover text, then removed. Final-source sequence:

- Air Ver2: PASS, 186.132s; `xcodebuild` exit 0, TEST SUCCEEDED.
- Duo Ver1 (unfolded landscape): UI test PASS, 288.482s, zero assertion failures. Command NOT PASS: post-test finalization hung for over six minutes after early simulator shutdown. Owned process was terminated (exit 143); result bundle lacks Info.plist and cannot be read by xcresulttool. Screenshots and test log are preserved. A clean command/result-bundle rerun remains outstanding.
- iPad Ver1: PASS, 190.162s; `xcodebuild` exit 0, TEST SUCCEEDED.

Primary inspected Air Ver2 Matrix screenshot: all four outbound/return flights, complete aircraft/block times, full report/end timestamps, duty/flight FDP and one layover per route are readable, with KPI/note/send still visible. Path: `docs/assets/screenshots/crew-app/compare-full-details-air-matrix-Ver2.png`.

Primary also inspected Air Twin By date and Duo Matrix / Twin Duty details screenshots. Metadata wraps without ellipses; Twin's longer content scrolls within the review pane. Duo Matrix keeps all four legs and the note/send controls visible together.

Primary inspected iPad Matrix and Twin Duty details: all four legs have readable full metadata, with scroll continuation for the Twin footer. Final evidence contains six screenshots per device (`matrix`, `twin-date`, `twin-date-footer`, `twin-details`, `twin-details-footer`, `tg-isolation`), prefixed `compare-full-details-<device>-` and suffixed `-Ver<N>.png` in the screenshot directory. All test simulators are shut down and the owned Duo screenshot watcher is stopped. Only one simulator was booted at a time; Duo Release was untouched.

Reproduction from `crew-app/ios` (substitute each device row in order):

| Device | UDID | Evidence version |
| --- | --- | --- |
| air | D8409020-8121-4F25-AC0F-A6C1ABA9B12F | 2 |
| duo | 08ACE4EC-2508-4DD8-9989-461C1DEF4D72 | 1 |
| ipad | 7E7EB9CC-3407-4103-9959-E159E143B68A | 1 |

```sh
TEST_RUNNER_TWIN_DEVICE="$review_device" \
TEST_RUNNER_ROUTE_DEVICE="$review_device" \
TEST_RUNNER_TWIN_SHOT_DIR=/Users/alps/DevOps/ROIs-Recovery-Ver1/docs/assets/screenshots/crew-app \
TEST_RUNNER_TWIN_VERSION="$review_version" \
xcodebuild test -workspace RoyceTravelTemplate.xcworkspace \
  -scheme RoyceTravelTemplateUITests -configuration Debug \
  -destination "id=$review_udid" -derivedDataPath /tmp/crew-app-ticket-air \
  -parallel-testing-enabled NO \
  -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testCompareFullDetailsAndTwinReviewAccountIsolation \
  CODE_SIGNING_ALLOWED=NO
```

For Duo also set `TEST_RUNNER_DUO_SHOT_DIR` to the same screenshot directory and run `bash scripts/duo-shot-watcher.sh 08ACE4EC-2508-4DD8-9989-461C1DEF4D72 <screenshot-directory>` while testing; capture the unfolded inner display, then stop the watcher. For iPad set `TEST_RUNNER_IPAD_SHOT_DIR` to the same directory. Logs: `/tmp/compare-full-air-Ver2.log`, `/tmp/compare-full-duo-Ver1.log`, `/tmp/compare-full-ipad-Ver1.log`.

The primary reviews delegated native tests and their screenshots. Native React Native UI has no browser equivalent: Playwright remains unrun; XCUITest drives real app controls. No actual swap submitted; no TestFlight upload, commit or push.

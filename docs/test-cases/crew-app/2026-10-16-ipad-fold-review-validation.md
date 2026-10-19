# iPad Twin Rail review folding

Version 213. Design: `docs/superpowers/specs/2026-10-16-twin-rail-fold-review.md`.

The Gantt-layout skill informed keeping the timeline primary. Review is absent before a complete give/take selection; selecting both opens it. Hide preserves the draft and note, Review reopens it, and Clear restores full-width browsing. Open wide-screen review is capped at 320pt / 40%, not half the screen. Phone explicit review navigation and the other three concepts remain unchanged.

## Automated checks

- PASS: `cd crew-app && npx jest __tests__/features/dutySwapTwinRail.test.tsx __tests__/features/dutySwapMatrixZoom.test.tsx __tests__/features/dutySwapMarket.test.tsx --runInBand --silent` — 41 tests, three suites.
- PASS: `cd crew-app && npx tsc --noEmit`.
- PASS: `npm run check:ui` — zero hard violations, 124 existing warnings.
- PASS: `git diff --check`.

New Jest cases cover 1210×834, 834×1210 and 669×951: empty and one-sided selection do not show review; both sides open it; hide/reopen preserves note and selections; removing a side returns to the folded state; completing a new pair reopens review; Clear removes the pane. Existing small-phone and other-concept tests pass.

## Native UI

Focused test: `DuoFitUITests/testTwinRailIPadReviewFoldingAndAccountIsolation`. Ver1 passed one test with zero failures in 171.448s. Primary inspected portrait/landscape initial and opened review screenshots. A visual overlap between the floating AI launcher and folded Review action was identified despite the action remaining tappable. The selection summary is now capped at 60% on large layouts to keep actions clear of the corner.

Ver2 PASS: one test, zero failures, 179.872s, xcodebuild exit 0. Added Review/AI launcher frame nonintersection checks in both initial orientations, landscape hidden state and portrait before reopening. All passed. Primary reviewed the delegated test and inspected final landscape opened/hidden and portrait cleared screenshots: full-width browsing, narrower readable review, selected draft retained, and tray actions clear of the launcher.

Exact command from `crew-app/ios`:

```sh
TEST_RUNNER_TWIN_SHOT_DIR=/Users/alps/DevOps/ROIs-Recovery-Ver1/docs/assets/screenshots/crew-app TEST_RUNNER_TWIN_VERSION=2 TEST_RUNNER_IPAD_SHOT_DIR=/Users/alps/DevOps/ROIs-Recovery-Ver1/docs/assets/screenshots/crew-app TEST_RUNNER_ROUTE_DEVICE=ipad xcodebuild test -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -configuration Debug -destination 'id=7E7EB9CC-3407-4103-9959-E159E143B68A' -derivedDataPath /tmp/crew-app-ticket-air -parallel-testing-enabled NO -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testTwinRailIPadReviewFoldingAndAccountIsolation CODE_SIGNING_ALLOWED=NO > /tmp/crew-twin-ipad-fold-review-Ver2.log 2>&1
```

Seven captures: `docs/assets/screenshots/crew-app/twin-ipad-fold-review-{portrait-empty,landscape-empty,landscape-open,landscape-hidden,portrait-reopened,portrait-cleared,tg-isolation}-Ver2.png`. Ver1 remains preserved. Result bundle: `/tmp/crew-app-ticket-air/Logs/Test/Test-RoyceTravelTemplateUITests-2026.10.16_17-01-18-+0700.xcresult`.

No live swap submission. One iPad simulator at a time; no simulators remain booted after testing. Air/Duo were not rerun for this iteration; phone and tall-layout behavior are covered by the focused Jest regression.

This React Native app has no equivalent browser UI. Playwright is unrun; native XCUITest is the real-UI evidence, not a passing Playwright receipt.

No TestFlight upload, commit or push.

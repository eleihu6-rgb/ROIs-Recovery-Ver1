# Twin Rail small-phone layout

Scope: Concept B only. The reported short landscape screen reserved most of its height for toolbars and the selection summary, collapsing the candidate list. Width-based tall mode also enabled a full review pane on a 667×375 phone.

Changes: below 560pt screen height, use compact toolbar spacing and one-row day headings. On short screens and compact phones below 740pt height, place Give/Take beside Clear/Review in one compact tray; full KPI detail remains in Review. The candidate list explicitly fills remaining height. Keep 40pt duty blocks, existing pinch behavior, selection state and the other three concepts unchanged. App/native version: 212.

## Automated verification

- PASS: `cd crew-app && npx jest __tests__/features/dutySwapTwinRail.test.tsx __tests__/features/dutySwapMatrixZoom.test.tsx __tests__/features/dutySwapMarket.test.tsx --runInBand --silent` — 38 tests in 3 suites. Existing Jest configuration warnings remain.
- PASS: `cd crew-app && npx tsc --noEmit`.
- PASS: `npm run check:ui` — zero hard violations, 124 existing warnings.
- PASS: `git diff --check`.

New unit cases cover 812×375, 667×375 and 375×667: compact tray, flexible candidate list, disabled incomplete review, selection, review/back and clear.

## Native validation

Focused XCUITest: `DuoFitUITests/testTwinRailSmallPhoneLandscapeDraftAndAccountIsolation`. Run on Air only, with other simulators shut down. Validate unfiltered candidate visibility, filter a specific crew, select give/take, review/back, retain draft through rotation and switch to TG without PR data. No live swap submission.

PASS: 1 native test, zero failures, 155.396 seconds. From `crew-app/ios`:

```sh
TEST_RUNNER_TWIN_SHOT_DIR=/Users/alps/DevOps/ROIs-Recovery-Ver1/docs/assets/screenshots/crew-app TEST_RUNNER_TWIN_VERSION=1 TEST_RUNNER_TWIN_PR_CREW=473006 xcodebuild test -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -configuration Debug -destination 'id=D8409020-8121-4F25-AC0F-A6C1ABA9B12F' -derivedDataPath /tmp/crew-app-ticket-air -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testTwinRailSmallPhoneLandscapeDraftAndAccountIsolation CODE_SIGNING_ALLOWED=NO
```

Log: `/tmp/twin-small-phone-Ver1.log`. Screenshots under `docs/assets/screenshots/crew-app/twin-small-phone-<state>-Ver1.png`: landscape-unfiltered, landscape-empty, landscape-selected, landscape-review, portrait-retained and tg-isolation. Primary agent reviewed the delegated test and visually inspected unfiltered/selected/review/portrait/TG captures. Unfiltered landscape shows two candidate rows below the pinned own duties instead of none. Assertions verify tray ≤60pt, 40pt pucks, selected draft retention and account isolation.

This native React Native screen has no equivalent browser UI; Playwright is not run. XCUITest is the real-UI validation path, not a claim of passing the repository's Playwright-specific gate. This iteration did not rerun Duo/iPad or capture 14-day landscape zoom; existing zoom unit regression passed. Small 375pt-high layouts are unit-tested; the real-UI run used Air landscape.

The Gantt layout skill guided preserving the roster viewport and fixed duty-block size; app-native tokens and styling remained authoritative. No changes to legality behavior or live submission were made.

No TestFlight upload, commit or push is part of this layout change.

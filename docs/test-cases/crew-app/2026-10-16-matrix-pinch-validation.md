# Matrix pinch validation — 2026-10-16

Implemented continuous two-finger row resizing (compact default through 160pt), aligned Mine/date/candidate rows, scroll offset scaling, gesture-time selection suppression, complete text-line budgets, and progressive wrapped duty details. No backend changes.

## Checks

From `crew-app/`:

```
npx jest __tests__/features/dutySwapMatrixZoom.test.tsx __tests__/features/dutySwapCabinCrew.test.tsx __tests__/features/dutySwap.test.ts --runInBand
npx tsc --noEmit
```

PASS: 38 tests, 3 suites. PASS: TypeScript. Existing Jest configuration warnings remain. Country-search test expectations were brought into line with the current full airport catalog (no R'Bot implementation changes).

From repository root: `npm run check:ui` — PASS, 0 hard violations, 124 existing warnings. `git diff --check -- crew-app` — PASS.

From `crew-app/ios/`:

```
TEST_RUNNER_IPAD_SHOT_DIR=/Users/alps/DevOps/ROIs-Recovery-Ver1/docs/assets/screenshots/crew-app TEST_RUNNER_IPAD_SHOT_VERSION=2 xcodebuild test -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -destination 'id=7E7EB9CC-3407-4103-9959-E159E143B68A' -parallel-testing-enabled NO -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testMatrixPinchHeightPR473006 -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testDutySwapRbotDoesNotLeakIntoTGAccount CODE_SIGNING_ALLOWED=NO
```

TG isolation test PASS (48.528s). Overall run INTERRUPTED, exit 75, Xcode internal operation error. PR regression did not finish in the latest run. Local diagnostic log: `/tmp/crew-matrix-pinch-xcode-v3.log`.

Earlier PR run reached Matrix and demonstrated expansion and shrinking, but FAILed an assertion that a single inverse pinch must return exactly to the initial height. Expanded size hit the upper clamp, so the updated test independently checks shrinking and repeated closing to the compact bound. Latest test has not completed. Screenshot `docs/assets/screenshots/crew-app/matrix-pinch-expanded-Ver1.png` was captured by that earlier XCUITest and visually inspected; it shows aligned expanded rows and extra Mine duty details. It predates the final wider-puck wrapping improvement and is not final passing evidence.

Playwright and its screenshot gate remain UNRUN: this native React Native app has no existing Playwright target/bridge. Native XCUITest is partial evidence, not a claim that the Playwright gate passed.

## Remaining manual/native checks

- Finish the updated native pinch regression and inspect a fresh versioned screenshot.
- On a regular iPhone, spread/close two fingers over Mine and candidate columns; verify full text lines and aligned dates.
- Scroll vertically before pinching; confirm the top visible date remains stable.
- Confirm one-finger horizontal/vertical scrolling, taps and locked duty behavior after pinch cancellation.
- Repeat with increased system text size and in landscape.

No commit or push performed. Independent read-only validation discovery was delegated; the primary agent reviewed the paths and native test implementation.

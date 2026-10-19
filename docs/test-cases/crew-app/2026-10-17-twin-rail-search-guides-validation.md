# Twin Rail search and selection guides

Native regression: `DuoFitUITests/testTwinRailSearchFirstGuidesAndAccountIsolation`.
Real account workflow: PR473006 → Twin Rail initial Search → submit unfiltered
search → landscape 14-day roster → select two own duties → scroll candidates →
7-day zoom → Clear → reopen Search → portrait header checks (Air/iPad) → switch
to TG35459 and verify PR roster/Twin Rail content is absent. No swap is sent.

Assertions cover exactly two dashed guides at the outer selected puck edges,
guides extending into candidates, own roster pinned while different candidate
crews scroll into view, fixed puck heights during time zoom, and no guides after
Clear. Own row height may change with the number of visible overlapping lanes.
Native accessibility state changes use predicate waits.

## Validation receipts

- Swift syntax: `swiftc -frontend -parse crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift` — PASS.
- Air Ver3: PASS, 1 test, 0 failures, 172.155 seconds. Full PR/TG workflow passed.
- Air Ver4 (final source218 colors): FAIL at immediate zoom-selection assertion;
  native accessibility state had not updated. The test now waits for that state.
  Final purple-guide/light-grid screenshots were captured before the failure and
  visually inspected. Air Ver3 proves the full workflow; Ver4 does not claim a
  full final-source pass.
- Air Ver1: FAIL before login because Metro8081 had exited. Restarted the module's
  Metro in a managed session and verified `/status` returned `packager-status:running`.
- Air Ver2: FAIL on an incorrect test assumption that total own-row height stayed
  constant when zoom changed visible overlap lanes; puck height remained constant.
- Duo Ver1: FAIL on immediate selection-state assertion; screenshot showed the
  selection and correct guides. Replaced the assertion with a predicate wait.
- Duo Ver2: FAIL in the existing login helper, where `use-captured-roster`
  disappeared before hittability could be determined. Postfailure screenshot
  showed Springboard. Exact app termination cause is unproven; no credential
  rejection was observed.
- Duo Ver3: FAIL, `twin-me-rail` absent after search; postfailure screenshot
  again showed Springboard. Final guide visuals remain unverified on Duo; this
  does not establish a UI defect. The test had already failed before the agent
  mistakenly shut down Duo during xcodebuild result finalization. The finalizer
  remained hung for over six minutes; only the owned xcodebuild was terminated
  (exit143). This run is not a completed passing receipt.
- iPad Ver1 (final source219 including mode-header fix): PASS, 1 test, 0 failures,
  314.869 seconds; xcodebuild exit0. All PR/TG assertions passed. Inspected the
  single-selection and portrait-cleared captures: purple guides contrast with
  the light grid; all four approach labels and header actions fit.
- Air Ver5 (final source219 mode-header follow-up): PASS, 1 test, 0 failures,
  186.138 seconds; xcodebuild exit0. All PR/TG assertions passed. Inspected the
  portrait-cleared screenshot: Matrix, Market, Ticket and Twin Rail labels are
  fully visible as four equal segments; Search remains distinct on the right.
- Primary-agent checks on source219: from `crew-app`,
  `npx jest __tests__/features/dutySwap*.test.* --runInBand --silent --testTimeout=15000`
  — PASS, 111 tests (`/tmp/crew-twin-219-jest.log`); `npx tsc --noEmit` — PASS.
  From repository root, `npm run check:ui` — PASS, 0 hard failures, 124 warnings
  (`/tmp/crew-twin-219-ui.log`). Scoped diff whitespace check — PASS.

Native rebuild preparation encountered a shared derived-data build lock; the
other session's build was preserved. Its successful build-for-testing compiled
the final predicate waits (binary16:07:06, source16:05:04), so subsequent tests
reused that binary. No competing build was started. Other sessions' simulators
were preserved; at most two devices were booted at once.

## Commands and artifacts

Run from `crew-app/ios`; use `xcodebuild test` for a changed test binary, or
`test-without-building` after a successful build-for-testing:

```sh
TEST_RUNNER_TWIN_DEVICE=air TEST_RUNNER_TWIN_SHOT_DIR=/Users/alps/DevOps/ROIs-Recovery-Ver1/docs/assets/screenshots/crew-app TEST_RUNNER_TWIN_VERSION=5 xcodebuild test-without-building -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -configuration Debug -destination 'id=D8409020-8121-4F25-AC0F-A6C1ABA9B12F' -derivedDataPath /tmp/crew-app-ticket-air -parallel-testing-enabled NO -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testTwinRailSearchFirstGuidesAndAccountIsolation CODE_SIGNING_ALLOWED=NO

TEST_RUNNER_TWIN_DEVICE=ipad TEST_RUNNER_TWIN_SHOT_DIR=/Users/alps/DevOps/ROIs-Recovery-Ver1/docs/assets/screenshots/crew-app TEST_RUNNER_IPAD_SHOT_DIR=/Users/alps/DevOps/ROIs-Recovery-Ver1/docs/assets/screenshots/crew-app TEST_RUNNER_TWIN_VERSION=1 TEST_RUNNER_ROUTE_DEVICE=ipad xcodebuild test-without-building -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -configuration Debug -destination 'id=7E7EB9CC-3407-4103-9959-E159E143B68A' -derivedDataPath /tmp/crew-app-ticket-air -parallel-testing-enabled NO -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testTwinRailSearchFirstGuidesAndAccountIsolation CODE_SIGNING_ALLOWED=NO

TEST_RUNNER_TWIN_DEVICE=duo TEST_RUNNER_DUO_SHOT_DIR=/Users/alps/DevOps/ROIs-Recovery-Ver1/docs/assets/screenshots/crew-app TEST_RUNNER_TWIN_VERSION=3 TEST_RUNNER_ROUTE_DEVICE=duo TEST_RUNNER_DUO_ORIENTATION=landscape xcodebuild test-without-building -workspace RoyceTravelTemplate.xcworkspace -scheme RoyceTravelTemplateUITests -configuration Debug -destination 'id=08ACE4EC-2508-4DD8-9989-461C1DEF4D72' -derivedDataPath /tmp/crew-app-ticket-air -parallel-testing-enabled NO -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testTwinRailSearchFirstGuidesAndAccountIsolation CODE_SIGNING_ALLOWED=NO
```

Air screenshots: `docs/assets/screenshots/crew-app/twin-search-guides-air-*-Ver3.png`
and final visual `twin-search-guides-air-{single-selection,multiple-scroll}-Ver4.png`.
Logs: `/tmp/crew-twin-search-air-Ver3.log`, `/tmp/crew-twin-search-air-Ver4.log`,
`/tmp/crew-twin-search-duo-Ver1.log`, `/tmp/crew-twin-search-duo-Ver2.log`,
`/tmp/crew-twin-search-duo-Ver3.log`, `/tmp/crew-twin-search-ipad-Ver1.log`.
Final iPad captures: `docs/assets/screenshots/crew-app/twin-search-guides-ipad-*-Ver1.png`.
Final Air captures: `docs/assets/screenshots/crew-app/twin-search-guides-air-*-Ver5.png`;
log `/tmp/crew-twin-search-air-Ver5.log`. Both final passing runs produced initial
search, single-selection, multiple-scroll, cleared, portrait-cleared and TG
isolation captures. Owned Air/iPad simulators were shut down after xcodebuild
exit0; the other session's Calendar simulator was preserved.

Duo uses its Test simulator's inner display3 with the host screenshot watcher;
prepare landscape using the documented `duoctl close` → `open` sequence if needed.
Wait for xcodebuild to exit before shutting down its device. Keep one owned
simulator running at a time and total booted simulators at most two, including
other sessions' devices. No other session's simulator/build is stopped.

This React Native screen has no equivalent browser UI. XCUITest is the real-UI
validation path; no Playwright pass is claimed.

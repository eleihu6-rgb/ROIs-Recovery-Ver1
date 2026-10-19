# Duty Swap Concept B validation

Scope: new Twin Rail concept; existing Matrix, Market and Ticket remain registered. Horizontal two-finger zoom uses 3/7/14-day windows, with fixed 40pt pucks and width-adaptive text. No vertical zoom is added to this concept.

## Automated checks

- PASS: `cd crew-app && npx tsc --noEmit`
- PASS: `cd crew-app && npx jest __tests__/features/dutySwap*.test.* --runInBand --silent` — 99 tests, 8 suites. Existing Jest configuration warnings remain.
- PASS: `npm run check:ui` — 0 hard violations, 124 existing warnings.
- PASS: `git diff --check`

The new Jest coverage verifies clipping, overlaps, calendar rollover, pinch scale mapping, progressive puck text, old approach persistence, filters/reset, multiple give/take selections, replacing the other crew, comparison retry, failed submit retention/retry, exact submit payload and account isolation. Submit is mocked; no live request is sent.

## Native UI procedure

Native React Native controls are validated through XCUITest, not Playwright: there is no equivalent web UI. The repository's Playwright-specific gate is therefore not run. Test: `DuoFitUITests/testTwinRailHorizontalZoomAndAccountIsolation`.

Sequence: iPhone Air → iPhone Duo Test → iPad, with only one booted at a time. Use the user-requested PR test crew, then switch to TG to verify account isolation. Never drive the user's Duo Release simulator.

Run from `crew-app/ios` with `TEST_RUNNER_TWIN_DEVICE`, `TEST_RUNNER_TWIN_VERSION`, `TEST_RUNNER_TWIN_PR_CREW`, `TEST_RUNNER_TWIN_SHOT_DIR` and `TEST_RUNNER_ROUTE_DEVICE`:

```sh
xcodebuild test -workspace RoyceTravelTemplate.xcworkspace \
  -scheme RoyceTravelTemplateUITests -configuration Debug \
  -destination 'id=<device-UDID>' -derivedDataPath /tmp/crew-app-ticket-air \
  -parallel-testing-enabled NO \
  -only-testing:RoyceTravelTemplateUITests/DuoFitUITests/testTwinRailHorizontalZoomAndAccountIsolation \
  CODE_SIGNING_ALLOWED=NO
```

Duo additionally uses `TEST_RUNNER_DUO_SHOT_DIR` and the existing `duo-shot-watcher.sh` to capture display 3 after opening and rotating the test simulator.

Assertions: calendar loads from live portal; date navigation changes the window; pinch apart/together changes the horizontal scale without changing puck height; select own and other crew duties; real comparison delta and full duty details load; search Crew section opens; all three old approaches render; switching to TG removes PR data.

## Results

Air Ver7: PASS, one native test, zero failures (152.171 seconds); `/tmp/crew-twin-air-Ver7.log`. Pinch-out reaches 7 days on the first gesture and 14 days on the second, with unchanged puck height. Calendar, pinch-out and full review screenshots were visually inspected. Review shows actual portal duties and KPI deltas. All original approaches and TG isolation assertions pass.

Duo Ver1: PASS, one native test, zero failures (212.067 seconds); `/tmp/crew-twin-duo-Ver1.log`. Expanded test applies a specific crew filter through real controls and asserts exactly one candidate before zoom and selection. Crew-filter, rails and review screenshots visually inspected: side-by-side rails/review, real deltas, and qualification warning visible. The candidate's fleet-difference warning means this is UI validation, not an approved submission pair. The rail warning considers candidate details collectively; verify the exact selected duties before drawing a qualification conclusion.

iPad Ver1: PASS, one native test, zero failures (169.144 seconds); `/tmp/crew-twin-ipad-Ver1.log`. Same specific-crew filter, zoom, fixed puck-height, review, old-approach and TG-isolation assertions. Pinch-out and review screenshots visually inspected; both panes and action are readable in portrait. Air → Duo → iPad runs were sequential, with only one simulator booted.

Earlier Air Ver4–6 failed the exact one-gesture 14-day assertion; some runner attempts referenced stale assertion locations. Renaming the native test ensured the current test was executed. Air Ver2 captured the full review/search/TG flow without a final PASS receipt; it is not the signoff run.

Versioned evidence is under `docs/assets/screenshots/crew-app/duty-swap-twin-<device>-<state>-Ver<N>.png`. Inspect the screenshots from each final run before signoff.

## Requested end-to-end submission extension

The user subsequently requested: filter to a crew carrying desired duties → inspect candidates on the Gantt with zoom in/out → select give/take duties → use the real legality check until one successful submission. A live submission is now in scope, but the specific give/desired duty or permission to choose the pair is awaiting clarification. Do not claim live submission from mocked Jest results. Stop after one successful submission; do not approve on behalf of the other crew or crew control.

Selection prerequisite: for both crews, remove the outgoing selection, then compare each incoming duty's full start/end interval against all retained duties and against the other incoming duties. Do not send a known overlapping pair. Passing this basic screen is not portal legality approval; rest, qualification and other rules still require the real check.

## Implementation and handoff

Concept B source lives in `crew-app/src/features/dutySwap/twinRail/`; registration is limited to `marketModel.ts`, `DutySwapHost.tsx` and `ApproachSwitch.tsx`. The primary agent reviewed delegated initial Jest coverage and extended it for pinch/adaptive text and specific crew filtering. Existing Matrix/Market/Ticket screen implementations were not changed by this work.

Concurrent work in `CrewMatrix.tsx`, `dutySwapMatrixZoom.test.tsx`, `dutySwapCabinCrew.test.tsx`, the matrix native test and app version 210 belongs to another session and was preserved. Do not revert it or claim it as Concept B work. No commit or push performed.

Next: resolve desired give/take pair (or permission to choose one on TEST), screen retained rosters for overlap, exercise real portal legality, retain failure evidence and revise the selection until one submission succeeds. Confirm the resulting request in records. Do not approve it as the recipient or claim roster changes from a submitted request alone.

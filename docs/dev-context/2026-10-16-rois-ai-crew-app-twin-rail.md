# 开发上下文（2026-10-16）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-10-16 15:48:35 +07
- Wing：`rois-ai`
- Topic：`crew-app-twin-rail`
- Title：crew-app-twin-rail
- Git branch：`main`

## 本轮对话上下文

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

## 当前工作树快照

### git status --short

```text
 M crew-app/__tests__/features/dutySwapCabinCrew.test.tsx
 M crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift
 M crew-app/src/features/dutySwap/components/CrewMatrix.tsx
 M crew-app/src/features/dutySwap/market/ApproachSwitch.tsx
 M crew-app/src/features/dutySwap/market/DutySwapHost.tsx
 M crew-app/src/features/dutySwap/market/marketModel.ts
 M crew-app/src/version.ts
?? "Crew App Duty Swap.mhtml"
?? crew-app/__tests__/features/dutySwapMatrixZoom.test.tsx
?? crew-app/__tests__/features/dutySwapTwinRail.test.tsx
?? crew-app/src/features/dutySwap/twinRail/
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-01_home_quick_actions.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-02_saved_dialog.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-03_saved_row.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-04_trip_ops_grid.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-05_tg_no_pr_meal.png
?? docs/assets/screenshots/crew-app/air-meal-trip-Ver1-06_tg_trip_ops_grid.png
?? docs/assets/screenshots/crew-app/appearance-dark-audit-Ver1.png
?? docs/assets/screenshots/crew-app/appearance-daylight-Ver1.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-month-detail-grid-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-month-detail-grid-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-month-detail-grid-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-returned-month-detail-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-returned-month-detail-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-selected-day-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-selected-day-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-selected-day-hours-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-selected-day-hours-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-stacked-month-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-stacked-month-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-35459-stacked-month-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-month-detail-grid-Ver1.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-month-detail-grid-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-returned-month-detail-Ver1.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-returned-month-detail-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-selected-day-Ver1.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-selected-day-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-selected-day-hours-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-stacked-month-Ver1.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-452320-stacked-month-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-month-detail-grid-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-month-detail-grid-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-month-detail-grid-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-month-detail-grid-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-month-detail-grid-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-returned-month-detail-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-returned-month-detail-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-returned-month-detail-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-selected-day-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-selected-day-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-selected-day-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-selected-day-hours-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-selected-day-hours-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-selected-day-hours-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-stacked-month-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-stacked-month-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-stacked-month-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-stacked-month-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-487424-stacked-month-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-540753-month-detail-grid-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-540753-returned-month-detail-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-540753-selected-day-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-540753-selected-day-hours-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-air-540753-stacked-month-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-month-detail-grid-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-month-detail-grid-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-month-detail-grid-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-month-detail-grid-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-month-detail-grid-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-month-detail-grid-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-returned-month-detail-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-returned-month-detail-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-returned-month-detail-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-returned-month-detail-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-returned-month-detail-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-returned-month-detail-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-hours-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-hours-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-hours-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-hours-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-hours-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-selected-day-hours-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-stacked-month-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-stacked-month-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-stacked-month-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-stacked-month-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-stacked-month-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-35459-stacked-month-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-month-detail-grid-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-month-detail-grid-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-returned-month-detail-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-returned-month-detail-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-selected-day-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-selected-day-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-selected-day-hours-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-selected-day-hours-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-stacked-month-Ver9.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-452320-stacked-month-Ver9.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-month-detail-grid-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-month-detail-grid-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-month-detail-grid-Ver6.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-month-detail-grid-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-month-detail-grid-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-month-detail-grid-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-returned-month-detail-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-returned-month-detail-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-Ver6.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-hours-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-hours-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-hours-Ver6.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-hours-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-hours-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-selected-day-hours-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver6.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-465800-stacked-month-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-month-detail-grid-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-month-detail-grid-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-month-detail-grid-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-month-detail-grid-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-returned-month-detail-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-returned-month-detail-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-hours-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-hours-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-hours-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-selected-day-hours-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-stacked-month-Ver4.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-stacked-month-Ver4.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-stacked-month-Ver7.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-479274-stacked-month-Ver7.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-month-detail-grid-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-month-detail-grid-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-month-detail-grid-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-month-detail-grid-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-returned-month-detail-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-returned-month-detail-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-hours-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-hours-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-hours-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-selected-day-hours-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-stacked-month-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-stacked-month-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-stacked-month-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-493065-stacked-month-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-month-detail-grid-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-month-detail-grid-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-month-detail-grid-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-month-detail-grid-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-returned-month-detail-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-returned-month-detail-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-hours-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-hours-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-hours-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-selected-day-hours-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-stacked-month-Ver5.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-stacked-month-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-stacked-month-Ver8.done
?? docs/assets/screenshots/crew-app/calendar-month-detail-duo-532510-stacked-month-Ver8.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-month-detail-grid-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-month-detail-grid-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-returned-month-detail-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-returned-month-detail-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-selected-day-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-selected-day-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-selected-day-hours-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-selected-day-hours-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-stacked-month-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-35459-stacked-month-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-month-detail-grid-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-month-detail-grid-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-returned-month-detail-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-returned-month-detail-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-selected-day-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-selected-day-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-selected-day-hours-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-selected-day-hours-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-stacked-month-Ver3.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-473006-stacked-month-Ver6.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-563044-month-detail-grid-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-563044-returned-month-detail-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-563044-selected-day-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-563044-selected-day-hours-Ver5.png
?? docs/assets/screenshots/crew-app/calendar-month-detail-ipad-563044-stacked-month-Ver5.png
?? docs/assets/screenshots/crew-app/checkin-dark-map-Ver1.png
?? docs/assets/screenshots/crew-app/checkin-daylight-map-Ver1.png
?? docs/assets/screenshots/crew-app/checkin-native-wide-Ver1.png
?? docs/assets/screenshots/crew-app/checkin-native-wide-Ver2.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-appearance-Ver1.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-home-Ver1.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-home-Ver2.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-preferences-Ver1.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-preferences-Ver2.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-profile-Ver1.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-profile-Ver2.png
?? docs/assets/screenshots/crew-app/daylight-grey-panels-profile-Ver3.png
?? docs/assets/screenshots/crew-app/destination-daylight-landscape-Ver1.png
?? docs/assets/screenshots/crew-app/destination-photo-blend-tall-Ver1.png
?? docs/assets/screenshots/crew-app/destination-photo-blend-wide-Ver1.png
?? docs/assets/screenshots/crew-app/destination-polish-tg-Ver1.png
?? docs/assets/screenshots/crew-app/dialog-daylight-audit-Ver1.png
?? docs/assets/screenshots/crew-app/duo-cover-home-no-overlap-Ver1.png
?? docs/assets/screenshots/crew-app/duo-cover-home-no-overlap-v197-Ver1.png
?? docs/assets/screenshots/crew-app/duo-cover-home-no-overlap-v197-Ver2.png
?? docs/assets/screenshots/crew-app/duo-cover-home-right-rail-v198-Ver1.png
?? docs/assets/screenshots/crew-app/duo-cover-home-right-rail-v198-Ver3.png
?? docs/assets/screenshots/crew-app/duo-home-dark-final-Ver1.png
?? docs/assets/screenshots/crew-app/duo-home-landscape-nav-final-Ver1.png
?? docs/assets/screenshots/crew-app/duo-home-portrait-nav-final-Ver1.png
?? docs/assets/screenshots/crew-app/duo-home-tall-aligned-Ver1.png
?? docs/assets/screenshots/crew-app/duo-home-wide-aligned-Ver1.png
?? docs/assets/screenshots/crew-app/duo-meal-L-Ver1.png
?? docs/assets/screenshots/crew-app/duo-meal-T-Ver1.png
?? docs/assets/screenshots/crew-app/duo-nav-inner-portrait-Ver1.png
?? docs/assets/screenshots/crew-app/duo-nav-outer-portrait-Ver2.png
?? docs/assets/screenshots/crew-app/duo-nav-outer-portrait-Ver3.png
?? docs/assets/screenshots/crew-app/duo-nav-outer-portrait-Ver4.png
?? docs/assets/screenshots/crew-app/duo-nav-portrait-separated-Ver1.png
?? docs/assets/screenshots/crew-app/duo-nav-portrait-separated-Ver2.png
?? docs/assets/screenshots/crew-app/duo-nav-portrait-separated-Ver3.png
?? docs/assets/screenshots/crew-app/duo-nav-rail-landscape-Ver1.png
?? docs/assets/screenshots/crew-app/duo-nav-rail-profile-Ver1.png
?? docs/assets/screenshots/crew-app/duo-nav-rail-schedule-Ver1.png
?? docs/assets/screenshots/crew-app/duo-nav-rail-schedule-map-Ver1.png
?? docs/assets/screenshots/crew-app/duo-nav-trip-details-cover-Ver2.png
?? docs/assets/screenshots/crew-app/duo-profile-L-Ver3.png
?? docs/assets/screenshots/crew-app/duo-profile-T-Ver2.png
?? docs/assets/screenshots/crew-app/duo-release-bundle-launch-Ver1.png
?? docs/assets/screenshots/crew-app/duo-release-bundle-launch-Ver2.png
?? docs/assets/screenshots/crew-app/duo-route-map-L-Ver3.png
?? docs/assets/screenshots/crew-app/duo-route-map-T-Ver2.png
?? docs/assets/screenshots/crew-app/duo-schedule-calendar-L-Ver1.png
?? docs/assets/screenshots/crew-app/duo-schedule-dark-final-Ver1.png
?? docs/assets/screenshots/crew-app/duo-schedule-timeline-L-Ver3.png
?? docs/assets/screenshots/crew-app/duo-schedule-timeline-T-Ver2.png
?? docs/assets/screenshots/crew-app/duo-swap-market-T-Ver1.png
?? docs/assets/screenshots/crew-app/duo-test-version173-installed-Ver1.png
?? docs/assets/screenshots/crew-app/duo-trip-details-L-Ver3.png
?? docs/assets/screenshots/crew-app/duo-trip-details-T-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-compare-air-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-matrix_tall-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-matrix_wide-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-matrix_wide-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_local_tall-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_local_wide-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_local_wide-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_open_tall-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_open_wide-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_open_wide-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_server_tall-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_server_wide-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-rbot_server_wide-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-search_tall-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-duo-search_wide-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-matrix-air-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-rbot-1-search-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-rbot-2-crews-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-rbot-3-picked-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-rbot-landscape-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-rbot-search-context-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-rbot-server-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-search-air-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-tg-preview-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-ticket-air-launch-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-ticket-air-metro-retry-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-ticket-air-running-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-calendar-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-calendar-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-calendar-Ver4.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-calendar-Ver5.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-calendar-Ver6.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-calendar-Ver7.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-pinch-in-Ver4.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-pinch-in-Ver5.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-pinch-in-Ver6.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-pinch-in-Ver7.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-pinch-out-Ver7.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-pinch-out-first-Ver7.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-rails-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-rails-Ver7.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-review-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-review-Ver7.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-search-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-search-Ver7.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-tg-isolation-Ver2.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-air-tg-isolation-Ver7.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-calendar-Ver1.done
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-calendar-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-crew-filter-Ver1.done
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-crew-filter-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-pinch-in-Ver1.done
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-pinch-in-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-pinch-out-Ver1.done
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-pinch-out-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-pinch-out-first-Ver1.done
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-pinch-out-first-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-rails-Ver1.done
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-rails-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-review-Ver1.done
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-review-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-search-Ver1.done
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-search-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-tg-isolation-Ver1.done
?? docs/assets/screenshots/crew-app/duty-swap-twin-duo-tg-isolation-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-ipad-calendar-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-ipad-crew-filter-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-ipad-pinch-in-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-ipad-pinch-out-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-ipad-pinch-out-first-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-ipad-rails-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-ipad-review-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-ipad-search-Ver1.png
?? docs/assets/screenshots/crew-app/duty-swap-twin-ipad-tg-isolation-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-calendar-graphite-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-calendar-tg-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-duo-calendar-65pct-transparent-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-duo-login-65pct-transparent-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-duo-month-detail-65pct-transparent-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-duo-schedule-55pct-transparent-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-duo-schedule-60pct-transparent-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-duo-schedule-65pct-transparent-Ver2.png
?? docs/assets/screenshots/crew-app/glass-surfaces-home-graphite-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-home-tg-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-login-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-menu-graphite-Ver1.png
?? docs/assets/screenshots/crew-app/glass-surfaces-menu-graphite-Ver2.png
?? docs/assets/screenshots/crew-app/glass-surfaces-menu-graphite-Ver3.png
?? docs/assets/screenshots/crew-app/global-daylight-landscape-Ver1.png
?? docs/assets/screenshots/crew-app/home-dark-audit-Ver1.png
?? docs/assets/screenshots/crew-app/home-daylight-ios-neutral-Ver1.png
?? docs/assets/screenshots/crew-app/home-daylight-landscape-Ver1.png
?? docs/assets/screenshots/crew-app/home-landscape-destination-grid-Ver1.png
?? docs/assets/screenshots/crew-app/home-landscape-destination-grid-Ver2.png
?? docs/assets/screenshots/crew-app/home-landscape-destination-grid-Ver3.png
?? docs/assets/screenshots/crew-app/home-landscape-destination-grid-Ver4.png
?? docs/assets/screenshots/crew-app/home-landscape-destination-grid-Ver5.png
?? docs/assets/screenshots/crew-app/home-portrait-destination-row-Ver1.png
?? docs/assets/screenshots/crew-app/ipad-landmark-DAD-landscape-Ver2.png
?? docs/assets/screenshots/crew-app/ipad-landmark-DAD-portrait-Ver2.png
?? docs/assets/screenshots/crew-app/ipad-landmark-DOH-landscape-Ver2.png
?? docs/assets/screenshots/crew-app/ipad-landmark-DOH-portrait-Ver2.png
?? docs/assets/screenshots/crew-app/ipad-landmark-SEA-landscape-Ver2.png
?? docs/assets/screenshots/crew-app/ipad-landmark-SEA-portrait-Ver2.png
?? docs/assets/screenshots/crew-app/ipad-pr-avatar-picker-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-avatar-picker-landscape-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-pr-avatar-picker-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-avatar-picker-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-avatar-picker-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-landscape-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-portrait-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-portrait-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-portrait-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-calendar-portrait-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-destination-portrait-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-destination-portrait-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-pr-destination-portrait-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-destination-portrait-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-destination-portrait-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-duty-swap-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-duty-swap-landscape-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-pr-duty-swap-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-duty-swap-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-duty-swap-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-duty-swap-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-landscape-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-portrait-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-portrait-Ver11.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-portrait-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-portrait-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-portrait-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-portrait-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-home-portrait-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-modal-upside-down-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-modal-upside-down-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-pr-modal-upside-down-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-modal-upside-down-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-landscape-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-portrait-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-portrait-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-pr-profile-portrait-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-route-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-route-landscape-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-pr-route-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-route-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-route-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-route-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-schedule-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-schedule-landscape-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-pr-schedule-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-pr-schedule-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/ipad-pr-schedule-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/ipad-pr-schedule-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pr-trip-details-portrait-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-pr-trip-details-portrait-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-pr-trip-details-portrait-Ver8.png
?? docs/assets/screenshots/crew-app/ipad-pro-11-v198-launch-Ver1.png
?? docs/assets/screenshots/crew-app/ipad-pro-11-v198-launch-Ver2.png
?? docs/assets/screenshots/crew-app/ipad-pro-11-v198-launch-Ver3.png
?? docs/assets/screenshots/crew-app/ipad-tg-home-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-tg-home-landscape-Ver12.png
?? docs/assets/screenshots/crew-app/ipad-tg-profile-landscape-Ver10.png
?? docs/assets/screenshots/crew-app/ipad-tg-profile-landscape-Ver12.png
?? docs/assets/screenshots/crew-app/iphone-air-release-170-checkin-Ver1.png
?? docs/assets/screenshots/crew-app/matrix-pinch-expanded-Ver1.png
?? docs/assets/screenshots/crew-app/portal-452320-auto-import-home-Ver1.png
?? docs/assets/screenshots/crew-app/portal-452320-auto-import-home-Ver2.done
?? docs/assets/screenshots/crew-app/portal-452320-auto-import-home-Ver2.png
?? docs/assets/screenshots/crew-app/portal-452320-auto-import-profile-Ver2.done
?? docs/assets/screenshots/crew-app/portal-452320-auto-import-profile-Ver2.png
?? docs/assets/screenshots/crew-app/portal-452320-refresh-before-Ver1.png
?? docs/assets/screenshots/crew-app/portal-auth-486541-response-Ver1.json
?? docs/assets/screenshots/crew-app/portal-login-rejection-ipad-Ver1.png
?? docs/assets/screenshots/crew-app/profile-dark-audit-Ver1.png
?? docs/assets/screenshots/crew-app/profile-daylight-audit-Ver1.png
?? docs/assets/screenshots/crew-app/profile-daylight-landscape-Ver1.png
?? docs/assets/screenshots/crew-app/profile-daylight-landscape-Ver2.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver1.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver2.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver3.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver4.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver5.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver6.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver7.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver8.png
?? docs/assets/screenshots/crew-app/profile-duo-pane-Ver9.png
?? docs/assets/screenshots/crew-app/profile-preferences-dark-audit-Ver1.png
?? docs/assets/screenshots/crew-app/profile-preferences-daylight-audit-Ver1.png
?? docs/assets/screenshots/crew-app/rbot-context-across-screens-Ver1.png
?? docs/assets/screenshots/crew-app/rbot-context-across-screens-Ver2.png
?? docs/assets/screenshots/crew-app/route-map-air-35459-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-air-465800-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-air-465800-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-air-473006-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-air-473006-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-air-487424-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-air-487424-Ver2.png
?? docs/assets/screenshots/crew-app/route-map-dark-audit-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-daylight-grey-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver2.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver4.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver5.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver6.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver7.png
?? docs/assets/screenshots/crew-app/route-map-daylight-landscape-Ver8.png
?? docs/assets/screenshots/crew-app/route-map-daylight-portrait-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-daylight-portrait-Ver2.png
?? docs/assets/screenshots/crew-app/route-map-daylight-portrait-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-duo-35459-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-duo-35459-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-duo-465800-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-duo-473006-Ver1.png
?? docs/assets/screenshots/crew-app/route-map-duo-473006-Ver3.png
?? docs/assets/screenshots/crew-app/route-map-duo-487424-Ver1.png
?? docs/assets/screenshots/crew-app/schedule-dark-last-two-flights-row-Ver1.png
?? docs/assets/screenshots/crew-app/schedule-daylight-last-two-flights-row-Ver1.png
?? docs/assets/screenshots/crew-app/schedule-outer-daylight-calendar-rail-Ver1.png
?? docs/assets/screenshots/crew-app/schedule-outer-daylight-rail-Ver1.png
?? docs/assets/screenshots/crew-app/schedule-outer-daylight-rail-Ver2.png
?? docs/assets/screenshots/crew-app/swap-rail-market-v196-Ver2.png
?? docs/assets/screenshots/crew-app/swap-rail-matrix-v196-Ver2.png
?? docs/assets/screenshots/crew-app/swap-rail-my-duties-v196-Ver1.png
?? docs/assets/screenshots/crew-app/swap-rail-rbot-open-v196-Ver1.png
?? docs/assets/screenshots/crew-app/swap-rail-requests-v196-Ver1.png
?? docs/assets/screenshots/crew-app/trip-details-dark-audit-Ver1.png
?? docs/assets/screenshots/crew-app/trip-details-grid-pr-login-loading-Ver1.png
?? docs/assets/screenshots/crew-app/trip-details-grid-run-Ver2/
?? docs/superpowers/specs/2026-10-16-crew-app-duty-swap-twin-rail-design.md
?? docs/superpowers/specs/2026-10-16-crew-matrix-pinch-height-design.md
?? docs/test-cases/crew-app/2026-10-16-matrix-pinch-validation.md
?? docs/test-cases/crew-app/2026-10-16-twin-rail-validation.md
```

### unstaged changed files

```text
crew-app/__tests__/features/dutySwapCabinCrew.test.tsx
crew-app/ios/RoyceTravelTemplateUITests/DuoFitUITests.swift
crew-app/src/features/dutySwap/components/CrewMatrix.tsx
crew-app/src/features/dutySwap/market/ApproachSwitch.tsx
crew-app/src/features/dutySwap/market/DutySwapHost.tsx
crew-app/src/features/dutySwap/market/marketModel.ts
crew-app/src/version.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-10-16-rois-ai-crew-app-twin-rail.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh rois-ai
git status --short
```
